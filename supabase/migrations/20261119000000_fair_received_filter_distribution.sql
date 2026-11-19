alter table public.inventory_movements
  add column if not exists source_rfq_item_id text,
  add column if not exists requested_filter_no text,
  add column if not exists supplier_part_number text,
  add column if not exists supplier_brand text,
  add column if not exists supplier_sap_code text;

create or replace function public.allocate_received_project_quotas(
  awarded_allocations jsonb,
  current_allocations jsonb,
  newly_received_quantity integer
)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  with awarded_rows as (
    select
      nullif(btrim(allocation.value ->> 'project'), '') as project_name,
      greatest(coalesce(nullif(allocation.value ->> 'qty', '')::numeric, 0), 0) as awarded_quantity,
      allocation.ordinality
    from jsonb_array_elements(
      case when jsonb_typeof(awarded_allocations) = 'array'
        then awarded_allocations else '[]'::jsonb end
    ) with ordinality as allocation(value, ordinality)
    where nullif(btrim(allocation.value ->> 'project'), '') is not null
  ),
  project_awards as (
    select project_name, sum(awarded_quantity) as awarded_quantity, min(ordinality) as ordinality
    from awarded_rows
    group by project_name
  ),
  current_rows as (
    select
      nullif(btrim(allocation.value ->> 'project'), '') as project_name,
      sum(greatest(coalesce(nullif(allocation.value ->> 'qty', '')::numeric, 0), 0)) as allocated_quantity,
      min(allocation.ordinality) as ordinality
    from jsonb_array_elements(
      case when jsonb_typeof(current_allocations) = 'array'
        then current_allocations else '[]'::jsonb end
    ) with ordinality as allocation(value, ordinality)
    where nullif(btrim(allocation.value ->> 'project'), '') is not null
    group by nullif(btrim(allocation.value ->> 'project'), '')
  ),
  capacities as (
    select
      award.project_name,
      award.awarded_quantity,
      coalesce(current.allocated_quantity, 0) as allocated_quantity,
      greatest(award.awarded_quantity - coalesce(current.allocated_quantity, 0), 0) as remaining_quantity,
      award.ordinality
    from project_awards award
    left join current_rows current using (project_name)
  ),
  totals as (
    select
      coalesce(sum(remaining_quantity), 0) as capacity,
      least(
        greatest(coalesce(newly_received_quantity, 0), 0),
        coalesce(sum(remaining_quantity), 0)
      ) as quantity_to_allocate
    from capacities
  ),
  shares as (
    select
      capacity.project_name,
      capacity.allocated_quantity,
      capacity.remaining_quantity,
      capacity.ordinality,
      totals.quantity_to_allocate,
      case when totals.capacity = 0 then 0
        else floor(totals.quantity_to_allocate * capacity.remaining_quantity / totals.capacity)::integer
      end as whole_share,
      case when totals.capacity = 0 then 0
        else (totals.quantity_to_allocate * capacity.remaining_quantity / totals.capacity)
          - floor(totals.quantity_to_allocate * capacity.remaining_quantity / totals.capacity)
      end as fractional_share
    from capacities capacity
    cross join totals
  ),
  ranked_shares as (
    select
      shares.*,
      row_number() over (order by fractional_share desc, ordinality) as remainder_rank,
      quantity_to_allocate - sum(whole_share) over () as remainder_units
    from shares
  ),
  final_allocations as (
    select
      project_name,
      allocated_quantity + whole_share
        + case when remainder_rank <= remainder_units then 1 else 0 end as quantity,
      ordinality
    from ranked_shares
    union all
    select current.project_name, current.allocated_quantity, 1000000000 + current.ordinality
    from current_rows current
    where not exists (
      select 1 from project_awards award where award.project_name = current.project_name
    )
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('project', project_name, 'qty', quantity) order by ordinality)
      filter (where quantity > 0),
    '[]'::jsonb
  )
  from final_allocations;
$$;

revoke all on function public.allocate_received_project_quotas(jsonb, jsonb, integer) from public, anon, authenticated;

update public.purchase_orders po
set payload = jsonb_set(
  po.payload,
  '{items}',
  coalesce((
    select jsonb_agg(
      item.value
      || jsonb_strip_nulls(jsonb_build_object(
        'source_rfq_item_id',
        coalesce(
          nullif(item.value ->> 'source_rfq_item_id', ''),
          (
            select source_item.value ->> 'id'
            from public.rfq_sessions session
            cross join lateral jsonb_array_elements(
              coalesce(session.payload -> 'items', '[]'::jsonb)
            ) with ordinality as source_item(value, ordinality)
            where session.code = po.rfq_code
              and (
                nullif(btrim(coalesce(item.value ->> 'mat_code', '')), '') is not null
                or nullif(btrim(coalesce(item.value ->> 'desc', '')), '') is not null
              )
              and (
                nullif(btrim(coalesce(item.value ->> 'mat_code', '')), '') is null
                or lower(btrim(coalesce(source_item.value ->> 'mat_code', '')))
                  = lower(btrim(item.value ->> 'mat_code'))
              )
              and (
                nullif(btrim(coalesce(item.value ->> 'desc', '')), '') is null
                or lower(btrim(coalesce(source_item.value ->> 'primary_number', '')))
                  = lower(btrim(item.value ->> 'desc'))
              )
            order by source_item.ordinality
            limit 1
          )
        )
      ))
      || case
        when item.value ? 'award_project_allocations' then '{}'::jsonb
        else jsonb_build_object(
          'award_project_allocations',
          case
            when jsonb_array_length(case
              when jsonb_typeof(item.value -> 'project_allocations') = 'array'
                then item.value -> 'project_allocations' else '[]'::jsonb
            end) > 0
              then item.value -> 'project_allocations'
            else public.infer_purchase_order_project_allocations(po.id, (item.ordinality - 1)::integer)
          end,
          'project_allocations',
          public.allocate_received_project_quotas(
            case
              when jsonb_array_length(case
                when jsonb_typeof(item.value -> 'project_allocations') = 'array'
                  then item.value -> 'project_allocations' else '[]'::jsonb
              end) > 0
                then item.value -> 'project_allocations'
              else public.infer_purchase_order_project_allocations(po.id, (item.ordinality - 1)::integer)
            end,
            coalesce((
              select jsonb_agg(
                jsonb_build_object('project', dispatch_totals.project_name, 'qty', dispatch_totals.quantity)
                order by dispatch_totals.first_ordinality
              )
              from (
                select
                  nullif(btrim(dispatch.value ->> 'project'), '') as project_name,
                  sum(greatest(coalesce(nullif(dispatch.value ->> 'qty', '')::numeric, 0), 0)) as quantity,
                  min(dispatch.ordinality) as first_ordinality
                from jsonb_array_elements(
                  case when jsonb_typeof(item.value -> 'dispatches') = 'array'
                    then item.value -> 'dispatches' else '[]'::jsonb end
                ) with ordinality as dispatch(value, ordinality)
                where nullif(btrim(dispatch.value ->> 'project'), '') is not null
                group by nullif(btrim(dispatch.value ->> 'project'), '')
              ) dispatch_totals
            ), '[]'::jsonb),
            greatest(
              coalesce(nullif(item.value ->> 'received_qty', '')::integer, 0)
              - coalesce((
                select sum(greatest(coalesce(nullif(dispatch.value ->> 'qty', '')::numeric, 0), 0))
                from jsonb_array_elements(
                  case when jsonb_typeof(item.value -> 'dispatches') = 'array'
                    then item.value -> 'dispatches' else '[]'::jsonb end
                ) as dispatch(value)
              ), 0)::integer,
              0
            )
          )
        )
      end
      order by item.ordinality
    )
    from jsonb_array_elements(coalesce(po.payload -> 'items', '[]'::jsonb))
      with ordinality as item(value, ordinality)
  ), '[]'::jsonb)
)
where exists (
  select 1
  from jsonb_array_elements(coalesce(po.payload -> 'items', '[]'::jsonb)) as item(value)
  where not (item.value ? 'award_project_allocations')
    or nullif(item.value ->> 'source_rfq_item_id', '') is null
);

create or replace function public.populate_inventory_movement_filter_identity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item_payload jsonb;
begin
  select po.payload -> 'items' -> new.item_index
  into item_payload
  from public.purchase_orders po
  where po.id = new.po_id;

  if item_payload is not null then
    new.source_rfq_item_id := coalesce(new.source_rfq_item_id, nullif(item_payload ->> 'source_rfq_item_id', ''));
    new.requested_filter_no := coalesce(new.requested_filter_no, nullif(item_payload ->> 'desc', ''));
    new.supplier_part_number := coalesce(
      new.supplier_part_number,
      nullif(item_payload ->> 'received_supplier_part_number', ''),
      nullif(item_payload ->> 'filter_no', '')
    );
    new.supplier_brand := coalesce(
      new.supplier_brand,
      nullif(item_payload ->> 'received_supplier_brand', ''),
      nullif(item_payload ->> 'supplier_brand', '')
    );
    new.supplier_sap_code := coalesce(
      new.supplier_sap_code,
      nullif(item_payload ->> 'received_supplier_sap_code', ''),
      nullif(item_payload ->> 'sap_code', '')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_movement_filter_identity on public.inventory_movements;
create trigger inventory_movement_filter_identity
  before insert on public.inventory_movements
  for each row execute function public.populate_inventory_movement_filter_identity();

create or replace function public.record_purchase_order_receipt_with_identity(
  target_order_id text,
  target_item_index integer,
  new_received_qty integer,
  receipt_voucher_no text,
  receipt_notes text,
  actual_supplier_part_number text,
  actual_supplier_brand text,
  actual_supplier_sap_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  order_row public.purchase_orders%rowtype;
  updated_order jsonb;
  items_payload jsonb;
  item_payload jsonb;
  award_allocations jsonb;
  current_allocations jsonb;
  new_allocations jsonb;
  old_received_quantity integer;
  receipt_delta integer;
  movement_id uuid;
begin
  if not public.has_permission('po.receive') or not public.has_permission('po.read') then
    raise exception 'ليس لديك صلاحية تسجيل الاستلام';
  end if;

  select * into order_row
  from public.purchase_orders
  where id = target_order_id
  for update;
  if not found then
    raise exception 'أمر الشراء غير موجود أو غير متاح لهذا الحساب';
  end if;
  if target_item_index is null or target_item_index < 0
    or coalesce(jsonb_typeof(order_row.payload -> 'items'), '') <> 'array'
    or target_item_index >= jsonb_array_length(order_row.payload -> 'items') then
    raise exception 'رقم الصنف غير صالح';
  end if;

  item_payload := order_row.payload -> 'items' -> target_item_index;
  old_received_quantity := coalesce(nullif(item_payload ->> 'received_qty', '')::integer, 0);
  receipt_delta := new_received_qty - old_received_quantity;
  award_allocations := case
    when jsonb_typeof(item_payload -> 'award_project_allocations') = 'array'
      then item_payload -> 'award_project_allocations'
    when jsonb_typeof(item_payload -> 'project_allocations') = 'array'
      then item_payload -> 'project_allocations'
    else '[]'::jsonb
  end;
  current_allocations := case
    when item_payload ? 'award_project_allocations'
      and jsonb_typeof(item_payload -> 'project_allocations') = 'array'
      then item_payload -> 'project_allocations'
    else '[]'::jsonb
  end;

  updated_order := public.record_purchase_order_receipt(
    target_order_id,
    target_item_index,
    new_received_qty,
    receipt_voucher_no,
    receipt_notes
  );
  items_payload := updated_order -> 'items';
  item_payload := items_payload -> target_item_index;

  new_allocations := public.allocate_received_project_quotas(
    award_allocations,
    current_allocations,
    greatest(receipt_delta, 0)
  );

  item_payload := jsonb_set(item_payload, '{award_project_allocations}', award_allocations, true);
  item_payload := jsonb_set(item_payload, '{project_allocations}', new_allocations, true);
  item_payload := jsonb_set(item_payload, '{received_supplier_part_number}',
    to_jsonb(coalesce(actual_supplier_part_number, '')), true);
  item_payload := jsonb_set(item_payload, '{received_supplier_brand}',
    to_jsonb(coalesce(actual_supplier_brand, '')), true);
  item_payload := jsonb_set(item_payload, '{received_supplier_sap_code}',
    to_jsonb(coalesce(actual_supplier_sap_code, '')), true);
  item_payload := jsonb_set(item_payload, '{received_supplier_identity_confirmed}', 'true'::jsonb, true);
  items_payload := jsonb_set(items_payload, array[target_item_index::text], item_payload, false);
  updated_order := jsonb_set(updated_order, '{items}', items_payload, false);

  perform set_config('siac.inventory_rpc', 'true', true);
  update public.purchase_orders
  set payload = updated_order, updated_at = now()
  where id = target_order_id;

  if receipt_delta > 0 then
    select movement.id into movement_id
    from public.inventory_movements movement
    where movement.po_id = target_order_id
      and movement.item_index = target_item_index
      and movement.movement_type = 'central_receipt'
      and movement.quantity = receipt_delta
      and movement.voucher_no = coalesce(receipt_voucher_no, '')
      and movement.created_at = transaction_timestamp()
    order by movement.id desc
    limit 1;

    if movement_id is not null then
      update public.inventory_movements
      set source_rfq_item_id = nullif(item_payload ->> 'source_rfq_item_id', ''),
          requested_filter_no = nullif(item_payload ->> 'desc', ''),
          supplier_part_number = nullif(actual_supplier_part_number, ''),
          supplier_brand = nullif(actual_supplier_brand, ''),
          supplier_sap_code = nullif(actual_supplier_sap_code, '')
      where id = movement_id;
    end if;
  end if;

  return updated_order;
end;
$$;

revoke all on function public.record_purchase_order_receipt_with_identity(
  text, integer, integer, text, text, text, text, text
) from public, anon;
grant execute on function public.record_purchase_order_receipt_with_identity(
  text, integer, integer, text, text, text, text, text
) to authenticated;

revoke all on function public.populate_inventory_movement_filter_identity() from public, anon, authenticated;

create or replace function public.load_assigned_project_purchase_orders()
returns table (
  id text,
  rfq_code text,
  payload jsonb,
  created_by_user_id uuid,
  created_by_email text,
  department_id text,
  department_name text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  assigned_project text;
begin
  if not public.has_permission('project.inventory.receive') then
    raise exception 'ليس لديك صلاحية عرض أوامر مخزن المشروع';
  end if;

  select profile.project_store_name into assigned_project
  from public.user_profiles profile
  where profile.id = auth.uid()
    and profile.is_active
    and profile.role_code = 'project_warehouse';
  if assigned_project is null then
    raise exception 'لم يتم ربط حسابك بمخزن مشروع؛ تواصل مع المسؤول';
  end if;

  return query
  select
    po.id,
    po.rfq_code,
    jsonb_set(
      jsonb_set(po.payload, '{items}', scoped.items, true),
      '{total_value}', to_jsonb(scoped.total_value), true
    ),
    null::uuid,
    ''::text,
    null::text,
    null::text
  from public.purchase_orders po
  cross join lateral (
    select
      jsonb_agg(
        item.value || jsonb_build_object(
          'project_allocations',
          coalesce((
            select jsonb_agg(allocation.value order by allocation.ordinality)
            from jsonb_array_elements(
              case
                when jsonb_typeof(item.value -> 'project_allocations') = 'array'
                  then item.value -> 'project_allocations'
                else '[]'::jsonb
              end
            ) with ordinality as allocation(value, ordinality)
            where allocation.value ->> 'project' = assigned_project
          ), '[]'::jsonb),
          'award_project_allocations',
          coalesce((
            select jsonb_agg(allocation.value order by allocation.ordinality)
            from jsonb_array_elements(
              case
                when jsonb_typeof(item.value -> 'award_project_allocations') = 'array'
                  then item.value -> 'award_project_allocations'
                else '[]'::jsonb
              end
            ) with ordinality as allocation(value, ordinality)
            where allocation.value ->> 'project' = assigned_project
          ), '[]'::jsonb),
          'dispatches',
          coalesce((
            select jsonb_agg(dispatch.value order by dispatch.ordinality)
            from jsonb_array_elements(
              case
                when jsonb_typeof(item.value -> 'dispatches') = 'array'
                  then item.value -> 'dispatches'
                else '[]'::jsonb
              end
            ) with ordinality as dispatch(value, ordinality)
            where dispatch.value ->> 'project' = assigned_project
          ), '[]'::jsonb)
        ) order by item.ordinality
      ) as items,
      coalesce(sum(
        coalesce((item.value ->> 'qty')::numeric, 0)
        * coalesce((item.value ->> 'unit_price')::numeric, 0)
      ), 0) as total_value
    from jsonb_array_elements(coalesce(po.payload -> 'items', '[]'::jsonb))
      with ordinality as item(value, ordinality)
  ) as scoped
  where exists (
    select 1
    from jsonb_array_elements(coalesce(scoped.items, '[]'::jsonb)) as scoped_item(value)
    where jsonb_array_length(case
      when jsonb_typeof(scoped_item.value -> 'project_allocations') = 'array'
        then scoped_item.value -> 'project_allocations' else '[]'::jsonb
    end) > 0
  );
end;
$$;

revoke all on function public.load_assigned_project_purchase_orders() from public;
grant execute on function public.load_assigned_project_purchase_orders() to authenticated;

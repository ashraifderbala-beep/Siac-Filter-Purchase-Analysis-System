begin;

do $$
declare
  admin_user_id uuid;
  project_user_id uuid;
  assigned_project text;
  test_order_id text := 'inventory-test-' || gen_random_uuid()::text;
  test_po_number text := 'TEST-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  test_item_code text := 'TEST-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  test_request_id uuid := gen_random_uuid();
  dispatch_request_id uuid := gen_random_uuid();
  receipt_request_id uuid := gen_random_uuid();
  over_receipt_request_id uuid := gen_random_uuid();
  issue_request_id uuid := gen_random_uuid();
  action_result jsonb;
  duplicate_result jsonb;
  first_movement_id uuid;
  duplicate_movement_id uuid;
  movement_count integer;
  received_quantity integer;
  received_identity text;
  received_quota integer;
  dispatched_count integer;
  project_balance integer;
begin
  if public.allocate_received_project_quotas(
    '[{"project":"Project A","qty":6},{"project":"Project B","qty":4}]'::jsonb,
    '[]'::jsonb,
    5
  ) <> '[{"project":"Project A","qty":3},{"project":"Project B","qty":2}]'::jsonb then
    raise exception 'TEST_FAIL: received stock was not allocated proportionally';
  end if;

  if public.allocate_received_project_quotas(
    '[{"project":"Project A","qty":6},{"project":"Project B","qty":4}]'::jsonb,
    '[{"project":"Project A","qty":3},{"project":"Project B","qty":2}]'::jsonb,
    5
  ) <> '[{"project":"Project A","qty":6},{"project":"Project B","qty":4}]'::jsonb then
    raise exception 'TEST_FAIL: incremental receipt allocation did not preserve the awarded quotas';
  end if;

  select profile.id into admin_user_id
  from public.user_profiles profile
  where profile.role_code = 'admin' and profile.is_active
  order by profile.created_at
  limit 1;
  if admin_user_id is null then
    raise exception 'TEST_SETUP: an active admin user_profile is required';
  end if;

  select profile.id, profile.project_store_name
    into project_user_id, assigned_project
  from public.user_profiles profile
  where profile.role_code = 'project_warehouse'
    and profile.is_active
    and nullif(btrim(profile.project_store_name), '') is not null
  order by profile.created_at
  limit 1;
  if project_user_id is null then
    raise exception 'TEST_SETUP: an active project_warehouse profile linked to a project is required';
  end if;

  insert into public.purchase_orders (
    id, rfq_code, payload, created_by_user_id, created_by_email,
    department_id, department_name
  )
  select
    test_order_id,
    null,
    jsonb_build_object(
      'id', test_order_id,
      'po_number', test_po_number,
      'title', 'Temporary inventory acceptance test',
      'supplier', 'TEST ONLY — rollback',
      'total_value', 40,
      'currency', 'EGP',
      'status', 'awarded',
      'created_at', now()::text,
      'updated_at', now()::text,
      'notes', 'This row is inside a transaction that is rolled back.',
      'items', jsonb_build_array(jsonb_build_object(
        'filter_no', test_item_code,
        'desc', 'Temporary inventory test item',
        'mat_code', test_item_code,
        'qty', 4,
        'unit_price', 10,
        'category', 'أصلي',
        'total', 40,
        'received_qty', 0,
        'project_allocations', jsonb_build_array(jsonb_build_object(
          'project', assigned_project,
          'qty', 4
        )),
        'dispatches', '[]'::jsonb
      )),
      'events', '[]'::jsonb
    ),
    profile.id,
    profile.email,
    profile.department_id,
    profile.department_name
  from public.user_profiles profile
  where profile.id = admin_user_id;

  perform set_config('request.jwt.claim.sub', admin_user_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', admin_user_id, 'role', 'authenticated'
  )::text, true);

  perform public.record_purchase_order_receipt_with_identity(
    test_order_id, 0, 4, 'TEST-RECEIPT', 'Temporary acceptance test',
    test_item_code || '-ALT', 'TEST-BRAND', test_item_code || '-SAP'
  );
  perform public.record_purchase_order_receipt_with_identity(
    test_order_id, 0, 4, 'TEST-RECEIPT', 'Duplicate absolute receipt',
    test_item_code || '-ALT', 'TEST-BRAND', test_item_code || '-SAP'
  );

  select count(*) into movement_count
  from public.inventory_movements
  where po_id = test_order_id and movement_type = 'central_receipt';
  select (item.value ->> 'received_qty')::integer into received_quantity
  from public.purchase_orders po
  cross join lateral jsonb_array_elements(po.payload -> 'items') as item(value)
  where po.id = test_order_id;
  select
    item.value ->> 'received_supplier_part_number',
    (item.value -> 'project_allocations' -> 0 ->> 'qty')::integer
  into received_identity, received_quota
  from public.purchase_orders po
  cross join lateral jsonb_array_elements(po.payload -> 'items') as item(value)
  where po.id = test_order_id;
  if movement_count <> 1 or received_quantity <> 4 then
    raise exception 'TEST_FAIL: repeating the central receipt duplicated or changed the balance';
  end if;
  if received_identity <> test_item_code || '-ALT' or received_quota <> 4 then
    raise exception 'TEST_FAIL: receipt identity or fair project quota was not persisted';
  end if;

  if not exists (
    select 1 from public.inventory_movements movement
    where movement.po_id = test_order_id
      and movement.movement_type = 'central_receipt'
      and movement.supplier_part_number = test_item_code || '-ALT'
      and movement.supplier_brand = 'TEST-BRAND'
      and movement.supplier_sap_code = test_item_code || '-SAP'
  ) then
    raise exception 'TEST_FAIL: inventory ledger did not retain the received supplier identity';
  end if;

  begin
    perform public.record_purchase_order_receipt(
      test_order_id, 0, 5, 'TEST-OVER-RECEIPT', 'Must be rejected'
    );
    raise exception 'TEST_FAIL: central over-receipt was accepted';
  exception when raise_exception then
    if sqlerrm like 'TEST_FAIL:%' then raise; end if;
    if sqlerrm <> 'الكمية المستلمة تتجاوز كمية أمر الشراء' then
      raise exception 'TEST_FAIL: unexpected central over-receipt error: %', sqlerrm;
    end if;
  end;

  action_result := public.record_purchase_order_dispatch_once(
    test_order_id, 0, assigned_project, 4, 'TEST-DISPATCH', 'Temporary acceptance test',
    dispatch_request_id
  );
  duplicate_result := public.record_purchase_order_dispatch_once(
    test_order_id, 0, assigned_project, 4, 'TEST-DISPATCH', 'Temporary acceptance test',
    dispatch_request_id
  );
  if action_result is distinct from duplicate_result then
    raise exception 'TEST_FAIL: repeated transfer did not return the original result';
  end if;
  select count(*) into movement_count
  from public.inventory_movements
  where po_id = test_order_id and movement_type = 'project_transfer';
  select jsonb_array_length(item.value -> 'dispatches') into dispatched_count
  from public.purchase_orders po
  cross join lateral jsonb_array_elements(po.payload -> 'items') as item(value)
  where po.id = test_order_id;
  if movement_count <> 1 or dispatched_count <> 1 then
    raise exception 'TEST_FAIL: repeated transfer created a duplicate movement or dispatch';
  end if;

  begin
    perform public.record_purchase_order_dispatch_once(
      test_order_id, 0, assigned_project, 3, 'TEST-DISPATCH', 'Changed quantity',
      dispatch_request_id
    );
    raise exception 'TEST_FAIL: reusing a request id with changed parameters was accepted';
  exception when raise_exception then
    if sqlerrm like 'TEST_FAIL:%' then raise; end if;
    if sqlerrm <> 'معرف الحركة مستخدم لطلب آخر' then
      raise exception 'TEST_FAIL: unexpected reused-request error: %', sqlerrm;
    end if;
  end;

  perform set_config('request.jwt.claim.sub', project_user_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', project_user_id, 'role', 'authenticated'
  )::text, true);

  first_movement_id := public.record_project_store_receipt_once(
    test_order_id, 0, 4, 'TEST-PROJECT-RECEIPT', 'Temporary acceptance test',
    receipt_request_id
  );
  duplicate_movement_id := public.record_project_store_receipt_once(
    test_order_id, 0, 4, 'TEST-PROJECT-RECEIPT', 'Temporary acceptance test',
    receipt_request_id
  );
  if first_movement_id is distinct from duplicate_movement_id then
    raise exception 'TEST_FAIL: repeated project receipt did not return the original movement';
  end if;
  select count(*) into movement_count
  from public.inventory_movements
  where po_id = test_order_id and movement_type = 'project_receipt';
  if movement_count <> 1 then
    raise exception 'TEST_FAIL: repeated project receipt created a duplicate movement';
  end if;

  begin
    perform public.record_project_store_receipt_once(
      test_order_id, 0, 1, 'TEST-PROJECT-OVER-RECEIPT', 'Must be rejected',
      over_receipt_request_id
    );
    raise exception 'TEST_FAIL: project receipt beyond the transfer quantity was accepted';
  exception when raise_exception then
    if sqlerrm like 'TEST_FAIL:%' then raise; end if;
    if sqlerrm <> 'الكمية المستلمة تتجاوز الكمية المحولة من المخزن المركزي' then
      raise exception 'TEST_FAIL: unexpected project over-receipt error: %', sqlerrm;
    end if;
  end;

  begin
    perform public.record_project_store_issue_once(
      test_order_id, 0, 5, 'TEST-EQUIPMENT', 'Temporary inventory test item',
      test_item_code, null, 'A1', 'TEST-ISSUE-OVER', 'Must be rejected',
      test_request_id
    );
    raise exception 'TEST_FAIL: issue beyond project balance was accepted';
  exception when raise_exception then
    if sqlerrm like 'TEST_FAIL:%' then raise; end if;
    if sqlerrm <> 'الكمية المطلوبة تتجاوز رصيد الفلتر المتاح في مخزن المشروع' then
      raise exception 'TEST_FAIL: unexpected project over-issue error: %', sqlerrm;
    end if;
  end;

  first_movement_id := public.record_project_store_issue_once(
    test_order_id, 0, 2, 'TEST-EQUIPMENT', 'Temporary inventory test item',
    test_item_code, null, 'A1', 'TEST-ISSUE', 'Temporary acceptance test',
    test_request_id
  );
  duplicate_movement_id := public.record_project_store_issue_once(
    test_order_id, 0, 2, 'TEST-EQUIPMENT', 'Temporary inventory test item',
    test_item_code, null, 'A1', 'TEST-ISSUE', 'Temporary acceptance test',
    test_request_id
  );
  if first_movement_id is distinct from duplicate_movement_id then
    raise exception 'TEST_FAIL: repeated issue did not return the original movement';
  end if;

  select count(*) into movement_count
  from public.inventory_movements
  where po_id = test_order_id and movement_type = 'project_issue';
  select coalesce(sum(case
    when movement_type = 'project_receipt' then quantity
    when movement_type = 'project_issue' then -quantity
    else 0
  end), 0)::integer into project_balance
  from public.inventory_movements
  where po_id = test_order_id and item_index = 0
    and project_name = assigned_project;
  if movement_count <> 1 or project_balance <> 2 then
    raise exception 'TEST_FAIL: repeated issue duplicated the movement or produced an incorrect project balance';
  end if;
end;
$$;

rollback;

select 'Inventory workflow checks passed; the test transaction was rolled back.' as test_result;

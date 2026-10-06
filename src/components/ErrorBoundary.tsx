import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught React Error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6" dir="rtl">
          <div className="bg-slate-800 rounded-3xl p-8 max-w-lg w-full border border-slate-700 shadow-2xl text-center space-y-4">
            <div className="w-16 h-16 bg-rose-900/40 text-rose-400 rounded-2xl flex items-center justify-center mx-auto border border-rose-800/60">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-white">حدث خطأ غير متوقع أثناء العرض</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              {this.state.error?.message || 'تعذر تحميل الصفحة بشكل سليم'}
            </p>
            <div className="pt-2 flex justify-center gap-3">
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.href = '/';
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>العودة للوحة الرئيسية للنظام</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

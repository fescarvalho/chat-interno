import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-red-50 text-red-900 h-full w-full flex flex-col items-center justify-center overflow-auto">
          <h2 className="text-2xl font-bold mb-4">Ops! O App encontrou um erro.</h2>
          <div className="bg-white p-4 rounded border border-red-200 w-full max-w-2xl">
            <h3 className="font-bold text-lg">{this.state.error?.toString()}</h3>
            <pre className="text-xs mt-2 overflow-x-auto p-2 bg-gray-100 rounded">
              {this.state.errorInfo?.componentStack}
            </pre>
          </div>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-6 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Recarregar Aplicativo
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

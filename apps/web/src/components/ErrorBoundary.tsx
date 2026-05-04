"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex h-screen w-screen items-center justify-center bg-[#0c0c0c] text-[#cccccc]">
            <div className="text-center">
              <h1 className="text-xl font-semibold text-[#e74856] mb-2">
                Something went wrong
              </h1>
              <p className="text-sm text-[#858585] mb-4">
                {this.state.error?.message ?? "An unexpected error occurred."}
              </p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 text-sm rounded bg-[#4fc1ff] text-black hover:bg-[#7dd4ff]"
              >
                Reload
              </button>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}

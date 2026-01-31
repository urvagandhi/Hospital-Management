/**
 * Error Boundary Component
 * Catches React errors and displays fallback UI
 */

import React, { ReactNode, ReactElement } from "react";
import { Button } from "./Button";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Error Boundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render(): ReactElement {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>

            <h1 className="text-2xl font-bold text-gray-900 mb-4">Something Went Wrong</h1>

            <p className="text-gray-600 mb-4">We're sorry, but something unexpected happened. Please try again or contact support if the problem persists.</p>

            {this.state.error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-left max-h-32 overflow-auto">
                <p className="text-xs font-mono text-red-800">{this.state.error.message}</p>
              </div>
            )}

            <div className="flex gap-3">
              <Button label="← Go Back" onClick={() => window.history.back()} variant="secondary" size="sm" fullWidth />
              <Button label="Refresh Page" onClick={() => window.location.reload()} variant="primary" size="sm" fullWidth />
            </div>
          </div>
        </div>
      );
    }

    return this.props.children as ReactElement;
  }
}

export default ErrorBoundary;

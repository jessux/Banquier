import { Component, type ErrorInfo, type ReactNode } from 'react';
interface Props {
    children: ReactNode;
}
interface State {
    error: Error | null;
}
export declare class ErrorBoundary extends Component<Props, State> {
    state: State;
    static getDerivedStateFromError(error: Error): State;
    componentDidCatch(error: Error, info: ErrorInfo): void;
    render(): ReactNode;
}
export {};

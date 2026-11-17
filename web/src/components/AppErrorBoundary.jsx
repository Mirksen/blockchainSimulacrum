import { Component } from 'react';
import { telemetry } from '../lib/telemetry';
import { AnalyticsControl } from './AnalyticsControl';

export class AppErrorBoundary extends Component {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    componentDidCatch(error) { void telemetry.reportError(error, 'react', true); }
    render() {
        if (this.state.failed) return <main className="simulation-intro"><div><h1>The simulator stopped unexpectedly</h1><p>Reload the page to reopen the simulator.</p><button className="btn btn-emphasized" onClick={() => window.location.reload()}>Reload simulation</button><AnalyticsControl /></div></main>;
        return this.props.children;
    }
}

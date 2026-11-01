import React from "react";
import { recordClientError } from "../errorDiagnostics.js";

function SectionContents({ render, children }) { return render ? render() : children; }
export default class SectionErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) {
    recordClientError({ source: "dashboard-section", message: `${this.props.name}: ${error?.message}`, route: window.location.hash });
  }
  render() {
    if (this.state.failed) return <div role="alert" style={{ padding: 16, border: "1px solid var(--border, #666)", borderRadius: 8 }}>
      {this.props.name} is temporarily unavailable. The rest of the dashboard is still usable.{" "}
      <button type="button" onClick={() => this.setState({ failed: false })}>Retry section</button>
    </div>;
    return <SectionContents render={this.props.render}>{this.props.children}</SectionContents>;
  }
}

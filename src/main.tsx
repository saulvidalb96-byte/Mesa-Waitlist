import React, { Component, ReactNode } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ToastProvider } from "./components/ui";
import "./styles.css";

class Crash extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="page">
        <div className="card">
          <h3>Something went wrong</h3>
          <p className="small">{this.state.err.message}</p>
          <button className="btn primary block" onClick={() => location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Crash>
    <BrowserRouter>
      <ToastProvider>
        <App />
      </ToastProvider>
    </BrowserRouter>
    </Crash>
  </React.StrictMode>
);

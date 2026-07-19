import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

type ErrorBoundaryState = { error?: Error };

class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <main className="root-error">
          <section>
            <h1>whytab 暂时没有正常打开</h1>
            <p>{this.state.error.message || "页面脚本遇到了错误。"}</p>
            <button onClick={() => window.location.reload()}>重新加载</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

const canUseWebAppCache = window.location.protocol === "https:"
  || ["localhost", "127.0.0.1"].includes(window.location.hostname);
if (canUseWebAppCache && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("./sw.js")
      .then((registration) => registration.update())
      .catch(() => undefined);
  });
}

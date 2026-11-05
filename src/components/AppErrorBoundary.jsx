import { Component } from 'react';

export default class AppErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() {
    // Send only a fixed diagnostic category; never exception contents or URLs.
    window.dispatchEvent(new CustomEvent('mboa:ui-error'));
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return <section className="page service-state" role="alert"><h1>Une erreur est survenue.</h1><p>Vous pouvez recharger Epizo pour reprendre votre navigation.</p><button className="button" onClick={() => window.location.reload()}>Recharger la page</button></section>;
  }
}

import { StrictMode, Suspense, lazy, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Landing from './landing/Landing';
import './styles.css';

const Studio = lazy(() => import('./studio/Studio'));

const route = () => (location.hash.startsWith('#/studio') ? 'studio' : 'home');

function App() {
  const [r, setR] = useState(route);
  useEffect(() => {
    const on = () => {
      setR(route());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.route = r;
  }, [r]);
  if (r === 'studio')
    return (
      <Suspense fallback={<div className="boot"><span className="spinner" /></div>}>
        <Studio />
      </Suspense>
    );
  return <Landing />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

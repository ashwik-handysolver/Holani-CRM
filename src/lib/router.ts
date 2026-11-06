import { useEffect, useState } from 'react';
import { View } from '../types';

export interface Route {
  view: View;
  id?: string;
  query: URLSearchParams;
}

const VIEWS: View[] = ['dashboard', 'calls', 'upload', 'followups', 'customers', 'products', 'drive'];

function parse(): Route {
  const [path, qs] = window.location.hash.replace(/^#\/?/, '').split('?');
  const [view, id] = path.split('/');
  return {
    view: VIEWS.includes(view as View) ? (view as View) : 'dashboard',
    id: id ? decodeURIComponent(id) : undefined,
    query: new URLSearchParams(qs || ''),
  };
}

export const navigate = (to: string) => {
  window.location.hash = to.startsWith('#') ? to : `#/${to.replace(/^\//, '')}`;
};

export function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => {
      setRoute(parse());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

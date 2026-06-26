import { ErrorPage } from 'react-os-shell';

// ErrorPage — centered error state. `code` selects the heading and copy.

export function NotFound() {
  return <div style={{ height: 480 }}><ErrorPage code={404} /></div>;
}

export function Forbidden() {
  return <div style={{ height: 480 }}><ErrorPage code={403} /></div>;
}

export function ServerError() {
  return <div style={{ height: 480 }}><ErrorPage code={500} /></div>;
}

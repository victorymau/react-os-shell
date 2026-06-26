/**
 * ErrorPage — a centered error state for 403 / 404 / 500. `code` selects the
 * heading and copy. Built from the kit's Button; pure presentational.
 */
import Button from '../forms/Button';

export interface ErrorPageProps {
  code?: 403 | 404 | 500;
}

const COPY: Record<NonNullable<ErrorPageProps['code']>, { title: string; body: string }> = {
  403: { title: 'Access denied', body: "You don't have permission to view this page." },
  404: { title: 'Page not found', body: "The page you're looking for doesn't exist or was moved." },
  500: { title: 'Something went wrong', body: 'An unexpected error occurred. Please try again.' },
};

export default function ErrorPage({ code = 404 }: ErrorPageProps) {
  const c = COPY[code];
  return (
    <div className="flex h-full flex-col items-center justify-center bg-gray-50 p-6 text-center">
      <div className="text-7xl font-bold tracking-tight text-gray-400">{code}</div>
      <h1 className="mt-2 text-xl font-semibold text-gray-900">{c.title}</h1>
      <p className="mt-1 max-w-sm text-sm text-gray-500">{c.body}</p>
      <div className="mt-6 flex items-center gap-2">
        <Button variant="secondary">Go back</Button>
        <Button>Take me home</Button>
      </div>
    </div>
  );
}

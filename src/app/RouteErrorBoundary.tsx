import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom';

export function RouteErrorBoundary() {
  const error = useRouteError();

  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : '發生未預期的錯誤。';

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6">
      <h1 className="text-lg font-semibold text-ink-900">頁面載入失敗</h1>
      <p className="mt-2 text-sm text-ink-600">{message}</p>
      <p className="mt-6">
        <Link to="/" className="text-sm text-accent-600 underline">
          回到總覽頁
        </Link>
      </p>
    </div>
  );
}

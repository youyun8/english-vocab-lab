import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="py-16 text-center">
      <p className="text-sm font-medium text-ink-500">404</p>
      <h1 className="mt-2 text-xl font-semibold text-ink-900">找不到這個頁面</h1>
      <p className="mt-2 text-sm text-ink-600">您輸入的網址可能已變更或不存在。</p>
      <Link to="/" className="mt-6 inline-block text-sm text-accent-600 underline">
        回到總覽頁
      </Link>
    </div>
  );
}

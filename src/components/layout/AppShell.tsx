import { NavLink, Outlet } from 'react-router-dom';
import { Suspense, useState } from 'react';

import { Button, Spinner } from '@/components/ui';
import { AppearanceMenu } from '@/features/appearance/components/AppearanceMenu';
import { useAuth } from '@/features/auth/auth-context';
import { useProgress } from '@/features/progress/progress-context';
import { cn } from '@/utils/cn';
import { MergePromptBanner } from '@/features/progress/MergePromptBanner';

const NAV_ITEMS = [
  { to: '/', label: '總覽', end: true },
  { to: '/words', label: '字彙庫', end: false },
  { to: '/quiz', label: '測驗', end: false },
  { to: '/review', label: '複習', end: false },
  { to: '/question-bank', label: '題庫', end: false },
  { to: '/stats', label: '學習分析', end: false },
  { to: '/settings', label: '設定', end: false },
] as const;

function navClass({ isActive }: { isActive: boolean }): string {
  return cn(
    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
    isActive ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
  );
}

function AccountControls() {
  const { status, user, signIn, signOut } = useAuth();

  if (status === 'loading') {
    return <span className="text-sm text-ink-400">…</span>;
  }

  if (status === 'authenticated' && user) {
    return (
      <div className="flex items-center gap-2">
        {user.githubAvatarUrl ? (
          <img
            src={user.githubAvatarUrl}
            alt=""
            width={24}
            height={24}
            className="h-6 w-6 rounded-full ring-1 ring-ink-200"
          />
        ) : null}
        <span className="hidden text-sm text-ink-600 sm:inline">{user.githubLogin}</span>
        <Button size="sm" variant="ghost" onClick={() => void signOut()}>
          登出
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {status === 'unavailable' ? (
        <span className="hidden text-xs text-amber-700 sm:inline">離線模式</span>
      ) : null}
      <Button size="sm" variant="secondary" onClick={signIn}>
        以 GitHub 登入
      </Button>
    </div>
  );
}

export function AppShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { mergePrompt } = useProgress();

  return (
    <div className="min-h-screen bg-ink-50">
      <a href="#main" className="skip-link">
        跳到主要內容
      </a>

      <header className="sticky top-0 z-40 border-b border-ink-200 bg-surface/95 backdrop-blur">
        <div className="app-container flex items-center gap-4 px-4 py-3">
          <NavLink to="/" className="shrink-0 text-sm font-semibold tracking-tight text-ink-900">
            English Vocabulary Lab
          </NavLink>

          <nav aria-label="主要導覽" className="hidden flex-1 items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <AppearanceMenu />
            <AccountControls />
            <Button
              size="sm"
              variant="ghost"
              className="md:hidden"
              aria-expanded={mobileNavOpen}
              aria-controls="mobile-nav"
              onClick={() => setMobileNavOpen((open) => !open)}
            >
              選單
            </Button>
          </div>
        </div>

        {mobileNavOpen ? (
          <nav
            id="mobile-nav"
            aria-label="主要導覽（行動版）"
            className="border-t border-ink-200 px-4 py-2 md:hidden"
          >
            <ul className="grid grid-cols-2 gap-1">
              {NAV_ITEMS.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={navClass}
                    onClick={() => setMobileNavOpen(false)}
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </header>

      {mergePrompt ? <MergePromptBanner prompt={mergePrompt} /> : null}

      <main id="main" className="app-container px-4 py-6 md:py-8">
        {/* Covers the code-split route chunks declared in `router.tsx`. */}
        <Suspense fallback={<Spinner label="載入頁面" />}>
          <Outlet />
        </Suspense>
      </main>

      <footer className="app-container px-4 pb-10 text-xs text-ink-400">
        <p>
          KK 音標為美式發音標註；瀏覽器語音僅供參考，並非發音權威。
          <span className="mx-2">·</span>
          <NavLink to="/about" className="underline hover:text-ink-600">
            關於本站
          </NavLink>
        </p>
      </footer>
    </div>
  );
}

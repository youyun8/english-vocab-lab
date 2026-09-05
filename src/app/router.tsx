import { lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';

import { AppShell } from '@/components/layout/AppShell';
import { AppProviders } from './providers';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { DashboardPage } from '@/pages/DashboardPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

/**
 * Routes below the dashboard are code-split: the quiz engine, statistics and
 * question bank are only downloaded when the learner actually opens them.
 * `AppShell` renders the Suspense boundary that covers these chunks.
 */
const lazyPage = <K extends string>(
  loader: () => Promise<Record<K, React.ComponentType>>,
  key: K,
) => lazy(async () => ({ default: (await loader())[key] }));

const WordBankPage = lazyPage(() => import('@/pages/WordBankPage'), 'WordBankPage');
const WordDetailPage = lazyPage(() => import('@/pages/WordDetailPage'), 'WordDetailPage');
const QuizPage = lazyPage(() => import('@/pages/QuizPage'), 'QuizPage');
const ReviewPage = lazyPage(() => import('@/pages/ReviewPage'), 'ReviewPage');
const QuestionBankPage = lazyPage(() => import('@/pages/QuestionBankPage'), 'QuestionBankPage');
const StatsPage = lazyPage(() => import('@/pages/StatsPage'), 'StatsPage');
const SettingsPage = lazyPage(() => import('@/pages/SettingsPage'), 'SettingsPage');
const AboutPage = lazyPage(() => import('@/pages/AboutPage'), 'AboutPage');

function Root() {
  return (
    <AppProviders>
      <AppShell />
    </AppProviders>
  );
}

/**
 * BrowserRouter (not HashRouter): Cloudflare's `single-page-application`
 * asset fallback serves index.html for unknown paths, so deep links,
 * refreshes and browser history all work with real URLs.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <Root />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'words', element: <WordBankPage /> },
      { path: 'words/:slug', element: <WordDetailPage /> },
      { path: 'quiz', element: <QuizPage /> },
      { path: 'review', element: <ReviewPage /> },
      { path: 'question-bank', element: <QuestionBankPage /> },
      { path: 'stats', element: <StatsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'about', element: <AboutPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

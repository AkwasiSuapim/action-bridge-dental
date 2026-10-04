import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import './styles.css';
import { Shell } from './components/shell';
import { LoginPage } from './features/auth/login-page';
import { HomePage } from './features/home/home-page';
import { ComposerPage } from './features/intake/intake-pages';
import { ManualPage } from './features/intake/manual-page';
import { AssistantPage } from './features/assistant/assistant-page';
import { FactsPage } from './features/case/facts-page';
import { QuestionsPage } from './features/case/questions-page';
import { OptionsPage } from './features/options/options-page';
import { SelfPayPage } from './features/options/self-pay';
import { DetailsPage } from './features/plan/details-page';
import { ReviewPage, SavedPage } from './features/saved/saved-pages';
import {
  ActivityPage,
  MyPlanPage,
  ProfilePage,
} from './features/account/account-pages';
import { AuthProvider } from './state/auth';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<Shell />}>
            <Route index element={<HomePage />} />
            <Route path="intake/manual" element={<ManualPage />} />
            <Route path="intake/:mode" element={<ComposerPage />} />
            <Route path="assistant/:jobId" element={<AssistantPage />} />
            <Route path="facts" element={<FactsPage />} />
            <Route path="questions" element={<QuestionsPage />} />
            <Route
              path="working"
              element={<Navigate to="/options" replace />}
            />
            <Route path="options" element={<OptionsPage />} />
            <Route path="self-pay" element={<SelfPayPage />} />
            <Route path="details" element={<DetailsPage />} />
            <Route path="review" element={<ReviewPage />} />
            <Route path="saved" element={<SavedPage />} />
            <Route path="my-plan" element={<MyPlanPage />} />
            <Route path="activity" element={<ActivityPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

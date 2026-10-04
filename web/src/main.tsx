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
import {
  PhotoPage,
  SpeakPage,
  TypePage,
  UploadPage,
} from './features/intake/intake-pages';
import { FactsPage } from './features/case/facts-page';
import { QuestionsPage } from './features/case/questions-page';
import { WorkingPage } from './features/case/working-page';
import { OptionsPage } from './features/options/options-page';
import { SelfPayPage } from './features/options/self-pay';
import { DetailsPage } from './features/plan/details-page';
import { ReviewPage, SavedPage } from './features/saved/saved-pages';
import {
  ActivityPage,
  MyPlanPage,
  ProfilePage,
} from './features/account/account-pages';
import { DemoProvider } from './state/demo-store';
import { JobProvider } from './state/job-store';
import { ManualPage } from './features/intake/manual-page';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <DemoProvider>
        <JobProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<Shell />}>
              <Route index element={<HomePage />} />
              <Route path="intake/type" element={<TypePage />} />
              <Route path="intake/manual" element={<ManualPage />} />
              <Route path="intake/speak" element={<SpeakPage />} />
              <Route path="intake/upload" element={<UploadPage />} />
              <Route path="intake/photo" element={<PhotoPage />} />
              <Route path="facts" element={<FactsPage />} />
              <Route path="questions" element={<QuestionsPage />} />
              <Route path="working" element={<WorkingPage />} />
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
        </JobProvider>
      </DemoProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

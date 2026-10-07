import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './styles/brand.css';

// Route-level code splitting: a visitor's phone only downloads the voting page.
const VotePage = lazy(() => import('./vote/VotePage'));
const DisplayPage = lazy(() => import('./display/DisplayPage'));
const AdminApp = lazy(() => import('./admin/AdminApp'));

const Loading = () => <div className="boot-spinner"><span className="spinner" /></div>;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/display" element={<DisplayPage />} />
          <Route path="/admin/*" element={<AdminApp />} />
          <Route path="*" element={<VotePage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
);

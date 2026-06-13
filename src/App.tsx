import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from '@/pages/Dashboard';
import ImageEditor from '@/pages/ImageEditor';
import DownloadCenter from '@/pages/DownloadCenter';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/editor/:id" element={<ImageEditor />} />
        <Route path="/download/:id" element={<DownloadCenter />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

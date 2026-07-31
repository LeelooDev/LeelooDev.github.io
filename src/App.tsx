import { Route, Routes } from 'react-router-dom'
import { SiteLayout } from './components/SiteLayout'
import { HomePage } from './pages/HomePage'
import { ArticlesPage } from './pages/ArticlesPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { ProjectDetailPage } from './pages/ProjectDetailPage'
import { ArchivePage } from './pages/ArchivePage'
import { NotesPage } from './pages/NotesPage'
import { PostPage } from './pages/PostPage'
import { AboutPage } from './pages/AboutPage'
import { NotFoundPage } from './pages/NotFoundPage'

export function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route index element={<HomePage />} />
        <Route path="articles" element={<ArticlesPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:index" element={<ProjectDetailPage />} />
        <Route path="archive" element={<ArchivePage />} />
        <Route path="notes" element={<NotesPage />} />
        <Route path="notes/:slug" element={<NotesPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="posts/:slug" element={<PostPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

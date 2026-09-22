import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import { Protected, Empty } from "./components/Common";
import { HomePage, LibraryPage, ChannelPage } from "./pages/Browse";
import { AuthPage, ProfilePage } from "./pages/Auth";
import UploadPage from "./pages/Upload";
const WatchPage = lazy(() => import("./pages/Watch"));
import DashboardPage, { AdminPage } from "./pages/Dashboard";
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="search" element={<HomePage />} />
        <Route path="login" element={<AuthPage />} />
        <Route path="register" element={<AuthPage register />} />
        <Route
          path="upload"
          element={
            <Protected>
              <UploadPage />
            </Protected>
          }
        />
        <Route
          path="watch/:id"
          element={
            <Suspense fallback={<p>Preparing your video…</p>}>
              <WatchPage />
            </Suspense>
          }
        />
        <Route path="channel/:id" element={<ChannelPage />} />
        <Route
          path="history"
          element={
            <Protected>
              <LibraryPage type="history" />
            </Protected>
          }
        />
        <Route
          path="watch-later"
          element={
            <Protected>
              <LibraryPage type="watch-later" />
            </Protected>
          }
        />
        {["dashboard", "dashboard/videos", "dashboard/analytics"].map(
          (path) => (
            <Route
              key={path}
              path={path}
              element={
                <Protected>
                  <DashboardPage />
                </Protected>
              }
            />
          ),
        )}
        <Route
          path="profile"
          element={
            <Protected>
              <ProfilePage />
            </Protected>
          }
        />
        <Route
          path="admin"
          element={
            <Protected admin>
              <AdminPage />
            </Protected>
          }
        />
        <Route
          path="*"
          element={
            <Empty
              title="This page wandered off."
              text="Use the navigation to find your way back."
              action={false}
            />
          }
        />
      </Route>
    </Routes>
  );
}

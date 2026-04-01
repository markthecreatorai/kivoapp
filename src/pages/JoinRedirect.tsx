import { Navigate, useParams, useSearchParams } from "react-router-dom";

export default function JoinRedirect() {
  const { slug } = useParams<{ slug: string }>();
  const [search] = useSearchParams();
  const invite = search.get("invite");

  if (!slug) return <Navigate to="/circles/explore" replace />;

  return <Navigate to={`/circles/${slug}${invite ? `?invite=${invite}` : ""}`} replace />;
}

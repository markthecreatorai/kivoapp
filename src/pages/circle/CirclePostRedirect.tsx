import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

export default function CirclePostRedirect() {
  const { slug, id } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (slug && id) {
      navigate(`/c/${slug}/feed?post=${id}`, { replace: true });
    }
  }, [slug, id, navigate]);

  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

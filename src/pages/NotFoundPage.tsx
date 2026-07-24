import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/layout/Logo";

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-base-950 px-4 text-center">
      <Logo />
      <p className="text-6xl font-bold text-base-700">404</p>
      <h1 className="text-xl font-semibold text-slate-100">페이지를 찾을 수 없습니다</h1>
      <p className="max-w-sm text-sm text-slate-400">
        요청하신 페이지가 존재하지 않거나 이동되었습니다.
      </p>
      <Link to="/">
        <Button>홈으로 돌아가기</Button>
      </Link>
    </div>
  );
}

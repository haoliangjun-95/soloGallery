import LoginForm from "@/components/admin/LoginForm";

export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  return (
    <div className="min-h-dvh flex items-center justify-center px-4">
      <LoginForm />
    </div>
  );
}

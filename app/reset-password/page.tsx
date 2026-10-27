import { AuthPages } from '@/components/pages/AuthPages';

export const dynamic = 'force-dynamic';

export default function ResetPasswordRoute() {
  return <AuthPages mode="reset" />;
}

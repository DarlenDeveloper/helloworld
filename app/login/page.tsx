// Redirect to auth page directly
import { redirect } from 'next/navigation'

export default function LoginPage() {
  redirect('/auth')
}

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { CheckCircle } from "lucide-react"

export default function SignUpSuccessPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">AIRIES AI CRM COMPANION</h1>
        </div>

        <Card className="shadow-xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl text-green-600">Account Created!</CardTitle>
            <CardDescription>
              We've sent you a confirmation email. Please check your inbox and click the verification link to activate
              your account.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-gray-600">
              Didn't receive the email? Check your spam folder or contact support.
            </p>
            <Button asChild className="w-full">
              <Link href="/login">Return to Login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

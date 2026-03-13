import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sendEmail, processTemplate, EMAIL_TEMPLATES } from '@/utils/email'

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const { type, to, variables, customSubject, customBody } = body

    if (!to) {
      return NextResponse.json({ error: 'Recipient email required' }, { status: 400 })
    }

    let subject: string
    let html: string

    if (type === 'custom') {
      subject = customSubject || 'Message from Nextgen Solutions'
      html = EMAIL_TEMPLATES.custom.html.replace('{{body}}', customBody || '')
    } else {
      const template = EMAIL_TEMPLATES[type as keyof typeof EMAIL_TEMPLATES]
      if (!template) {
        return NextResponse.json({ error: 'Invalid email type' }, { status: 400 })
      }
      const vars = {
        ...variables,
        companyEmail: process.env.NEXT_PUBLIC_COMPANY_EMAIL || 'info@nextgensolutions.com',
      }
      subject = processTemplate(template.subject, vars)
      html = processTemplate(template.html, vars)
    }

    const result = await sendEmail({ to, subject, html })
    return NextResponse.json(result)
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

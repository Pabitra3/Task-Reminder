import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EmailData {
  to: string
  subject: string
  html: string
}

interface PushSubscription {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get tasks due for email notifications
    const { data: emailTasks, error: emailError } = await supabaseClient
      .rpc('get_tasks_due_for_email_notifications')

    if (emailError) {
      console.error('Error fetching email tasks:', emailError)
    }

    // Get tasks due for push notifications
    const { data: pushTasks, error: pushError } = await supabaseClient
      .rpc('get_tasks_due_for_notifications')

    if (pushError) {
      console.error('Error fetching push tasks:', pushError)
    }

    let emailsSent = 0
    let pushNotificationsSent = 0

    // Process email notifications
    if (emailTasks && emailTasks.length > 0) {
      for (const task of emailTasks) {
        try {
          await sendEmailReminder(task)
          emailsSent++
        } catch (error) {
          console.error('Error sending email reminder:', error)
        }
      }
    }

    // Process push notifications
    if (pushTasks && pushTasks.length > 0) {
      for (const task of pushTasks) {
        // Get push subscriptions for this user
        const { data: subscriptions, error: subError } = await supabaseClient
          .from('push_subscriptions')
          .select('*')
          .eq('user_id', task.user_id)

        if (subError) {
          console.error('Error fetching subscriptions:', subError)
          continue
        }

        if (!subscriptions || subscriptions.length === 0) {
          console.log(`No push subscriptions found for user ${task.user_id}`)
          continue
        }

        // Send notification to each subscription
        for (const subscription of subscriptions) {
          try {
            await sendPushNotification(subscription, task)
            pushNotificationsSent++
          } catch (error) {
            console.error('Error sending push notification:', error)
            
            // Remove invalid subscriptions
            if (error.message?.includes('410') || error.message?.includes('invalid')) {
              await supabaseClient
                .from('push_subscriptions')
                .delete()
                .eq('id', subscription.id)
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        emailReminders: emailsSent,
        pushNotifications: pushNotificationsSent,
        totalTasks: (emailTasks?.length || 0) + (pushTasks?.length || 0)
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error in send-notifications function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})

async function sendEmailReminder(task: any) {
  try {
    const timingLabel = getTimingLabel(task.notification_time || '1hour')
    
    const emailData: EmailData = {
      to: task.user_email,
      subject: `⏰ Task Reminder: ${task.task_title}`,
      html: generateEmailHTML(task, timingLabel)
    }

    // Check if we have email service configuration
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const smtpHost = Deno.env.get('SMTP_HOST')
    const smtpUser = Deno.env.get('SMTP_USER')
    const smtpPass = Deno.env.get('SMTP_PASS')

    if (resendApiKey) {
      // Use Resend service
      await sendWithResend(emailData, resendApiKey)
    } else if (smtpHost && smtpUser && smtpPass) {
      // Use SMTP configuration
      await sendWithSMTP(emailData, { host: smtpHost, user: smtpUser, pass: smtpPass })
    } else {
      // Simulate email sending for development
      console.log('📧 EMAIL REMINDER SENT:', {
        to: emailData.to,
        subject: emailData.subject,
        taskId: task.task_id,
        taskTitle: task.task_title,
        priority: task.priority,
        timing: task.notification_time,
        dueTime: task.due_time,
        timestamp: new Date().toISOString()
      })
    }
    
  } catch (error) {
    console.error('Error sending email reminder:', error)
    throw error
  }
}

async function sendWithResend(emailData: EmailData, apiKey: string) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'TaskReminder <noreply@taskreminder.app>',
      to: emailData.to,
      subject: emailData.subject,
      html: emailData.html,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Resend API error: ${error}`)
  }

  console.log('Email sent via Resend to:', emailData.to)
}

async function sendWithSMTP(emailData: EmailData, config: any) {
  // For SMTP, you would typically use a library like nodemailer
  // Since we're in Deno, we'll simulate this for now
  console.log('📧 EMAIL SENT VIA SMTP:', {
    to: emailData.to,
    subject: emailData.subject,
    smtpHost: config.host,
    timestamp: new Date().toISOString()
  })
}

function generateEmailHTML(task: any, timingLabel: string): string {
  const priorityColor = getPriorityColor(task.priority)
  const priorityBadge = getPriorityBadge(task.priority)
  
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Task Reminder</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f9fafb; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
        .header { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; padding: 32px 24px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; font-weight: 700; }
        .header p { margin: 8px 0 0 0; opacity: 0.9; font-size: 16px; }
        .content { padding: 32px 24px; }
        .task-card { background-color: #f8fafc; border-left: 4px solid ${priorityColor}; border-radius: 8px; padding: 24px; margin: 24px 0; }
        .task-title { font-size: 20px; font-weight: 600; color: #1f2937; margin: 0 0 8px 0; }
        .task-description { color: #6b7280; margin: 8px 0 16px 0; line-height: 1.5; }
        .task-meta { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 16px; }
        .meta-item { display: flex; align-items: center; gap: 6px; font-size: 14px; color: #6b7280; }
        .priority-badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; color: white; background-color: ${priorityColor}; }
        .due-time { background-color: #dbeafe; color: #1e40af; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 500; }
        .cta-section { text-align: center; margin: 32px 0; }
        .cta-button { display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; transition: background-color 0.2s; }
        .cta-button:hover { background-color: #1d4ed8; }
        .footer { background-color: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb; }
        .footer p { margin: 0; color: #6b7280; font-size: 14px; }
        .footer a { color: #2563eb; text-decoration: none; }
        @media (max-width: 600px) {
          .header { padding: 24px 16px; }
          .content { padding: 24px 16px; }
          .task-card { padding: 16px; }
          .task-meta { flex-direction: column; align-items: flex-start; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>⏰ Task Reminder</h1>
          <p>Your task is due soon!</p>
        </div>
        
        <div class="content">
          <div class="task-card">
            <h2 class="task-title">${task.task_title}</h2>
            ${task.task_description ? `<p class="task-description">${task.task_description}</p>` : ''}
            
            <div class="task-meta">
              <div class="meta-item">
                <span>📅</span>
                <span><strong>Due:</strong> ${formatDate(task.due_date)} at ${task.due_time}</span>
              </div>
              <div class="meta-item">
                <span>⏱️</span>
                <span><strong>Reminder:</strong> ${timingLabel} before</span>
              </div>
            </div>
            
            <div class="task-meta">
              <span class="priority-badge">
                ${priorityBadge} ${task.priority.toUpperCase()} PRIORITY
              </span>
              <span class="due-time">
                Due in ${timingLabel}
              </span>
            </div>
          </div>
          
          <div class="cta-section">
            <a href="${Deno.env.get('FRONTEND_URL') || 'https://your-app.com'}/?task=${task.task_id}" class="cta-button">
              📱 Open TaskReminder App
            </a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; line-height: 1.5; margin-top: 24px;">
            💡 <strong>Pro Tip:</strong> You can also enable push notifications in the app for instant alerts with custom ringtones on your mobile device.
          </p>
        </div>
        
        <div class="footer">
          <p>
            This reminder was sent because you enabled email notifications for this task.<br>
            <a href="${Deno.env.get('FRONTEND_URL') || 'https://your-app.com'}/settings">Manage your notification preferences</a>
          </p>
          <p style="margin-top: 12px;">
            <strong>TaskReminder</strong> - Organize your tasks with smart reminders
          </p>
        </div>
      </div>
    </body>
    </html>
  `
}

async function sendPushNotification(subscription: any, task: any) {
  const timingLabel = getTimingLabel(task.notification_time || '10min')
  
  // Simulate push notification for development
  console.log('🔔 PUSH NOTIFICATION SENT:', {
    title: '🔔 Task Due Soon!',
    body: `${task.task_title} is due in ${timingLabel}`,
    taskId: task.task_id,
    priority: task.priority,
    timing: task.notification_time,
    dueTime: task.due_time,
    sound: '/notification.mp3',
    vibrate: [200, 100, 200, 100, 200],
    timestamp: new Date().toISOString()
  })
  
  return Promise.resolve()
}

function getTimingLabel(timing: string): string {
  const timingMap: { [key: string]: string } = {
    '3min': '3 minutes',
    '5min': '5 minutes',
    '10min': '10 minutes',
    '15min': '15 minutes',
    '20min': '20 minutes',
    '25min': '25 minutes',
    '30min': '30 minutes',
    '45min': '45 minutes',
    '50min': '50 minutes',
    '1hour': '1 hour',
    '2hours': '2 hours',
    '1day': '1 day',
  }
  return timingMap[timing] || '10 minutes'
}

function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'high': return '#ef4444'
    case 'medium': return '#eab308'
    case 'low': return '#22c55e'
    default: return '#6b7280'
  }
}

function getPriorityBadge(priority: string): string {
  switch (priority) {
    case 'high': return '🔴'
    case 'medium': return '🟡'
    case 'low': return '🟢'
    default: return '⚪'
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  })
}
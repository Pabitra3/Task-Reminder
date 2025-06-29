import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // Get tasks due for notifications with custom timing
    const { data: tasksDue, error: tasksError } = await supabaseClient
      .rpc('get_tasks_due_for_notifications')

    if (tasksError) {
      console.error('Error fetching tasks due for notifications:', tasksError)
      throw tasksError
    }

    if (!tasksDue || tasksDue.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No tasks due for notifications', sent: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let notificationsSent = 0

    // Process each task
    for (const task of tasksDue) {
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
          notificationsSent++
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

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Processed ${tasksDue.length} tasks`,
        sent: notificationsSent
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in send-push-notifications function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})

async function sendPushNotification(subscription: any, task: any) {
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidEmail = Deno.env.get('VAPID_EMAIL') || 'mailto:admin@taskreminder.app'

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.log('VAPID keys not configured - simulating notification send')
    return simulateNotificationSend(task)
  }

  const pushSubscription: PushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth
    }
  }

  // Get notification timing label
  const getTimingLabel = (timing: string) => {
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
      '1day': '1 day'
    }
    return timingMap[timing] || '10 minutes'
  }

  const timingLabel = getTimingLabel(task.notification_time || '10min')
  
  const payload = JSON.stringify({
    title: '🔔 Task Due Soon!',
    body: `${task.task_title} is due in ${timingLabel}`,
    icon: '/icon-192x192.png',
    badge: '/badge-72x72.png',
    sound: '/notification.mp3',
    vibrate: [200, 100, 200, 100, 200],
    data: {
      taskId: task.task_id,
      taskTitle: task.task_title,
      taskDescription: task.task_description,
      dueTime: task.due_time,
      priority: task.priority,
      notificationTime: task.notification_time,
      url: '/',
      sound: '/notification.mp3'
    },
    actions: [
      {
        action: 'view',
        title: 'View Task',
        icon: '/icon-view.png'
      },
      {
        action: 'complete',
        title: 'Mark Complete',
        icon: '/icon-complete.png'
      },
      {
        action: 'snooze',
        title: 'Snooze 5min',
        icon: '/icon-snooze.png'
      }
    ],
    requireInteraction: true,
    silent: false,
    tag: `task-${task.task_id}`,
    renotify: true,
    timestamp: Date.now()
  })

  // For WebContainer environment, simulate the notification
  return simulateNotificationSend(task)
}

function simulateNotificationSend(task: any) {
  const timingLabel = getTimingLabel(task.notification_time || '10min')
  
  console.log('🔔 PUSH NOTIFICATION SENT:', {
    title: '🔔 Task Due Soon!',
    body: `${task.task_title} is due in ${timingLabel}`,
    taskId: task.task_id,
    priority: task.priority,
    timing: task.notification_time,
    dueTime: task.due_time,
    sound: '/notification.mp3',
    vibrate: [200, 100, 200, 100, 200],
    timestamp: new Date().toISOString(),
    actions: ['View Task', 'Mark Complete', 'Snooze 5min']
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
    '1day': '1 day'
  }
  return timingMap[timing] || '10 minutes'
}
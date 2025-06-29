import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Database = {
  public: {
    Tables: {
      tasks: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          due_date: string;
          due_time: string;
          priority: 'low' | 'medium' | 'high';
          completed: boolean;
          user_id: string;
          list_id: string | null;
          email_reminder: boolean;
          push_notification: boolean;
          notification_time: string;
          recurrence: 'none' | 'daily' | 'weekly' | 'monthly';
          recurrence_id: string | null;
          is_recurring_parent: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          due_date: string;
          due_time: string;
          priority?: 'low' | 'medium' | 'high';
          completed?: boolean;
          user_id: string;
          list_id?: string | null;
          email_reminder?: boolean;
          push_notification?: boolean;
          notification_time?: string;
          recurrence?: 'none' | 'daily' | 'weekly' | 'monthly';
          recurrence_id?: string | null;
          is_recurring_parent?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string | null;
          due_date?: string;
          due_time?: string;
          priority?: 'low' | 'medium' | 'high';
          completed?: boolean;
          user_id?: string;
          list_id?: string | null;
          email_reminder?: boolean;
          push_notification?: boolean;
          notification_time?: string;
          recurrence?: 'none' | 'daily' | 'weekly' | 'monthly';
          recurrence_id?: string | null;
          is_recurring_parent?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      task_lists: {
        Row: {
          id: string;
          name: string;
          user_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          user_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          user_id?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          endpoint?: string;
          p256dh?: string;
          auth?: string;
          user_agent?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
};
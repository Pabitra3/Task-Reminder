# TaskReminder - Smart Task Management PWA

A modern, responsive task management application with offline support, push notifications, and recurring tasks.

## Features

- 📱 **Progressive Web App (PWA)** - Works offline and can be installed on mobile devices
- 🔔 **Smart Notifications** - Customizable push and email reminders
- 🔄 **Recurring Tasks** - Daily, weekly, and monthly recurring tasks
- 📋 **Task Lists** - Organize tasks into custom lists
- 🌐 **Offline Support** - Full functionality when offline with automatic sync
- 📅 **Calendar View** - Beautiful calendar interface with FullCalendar
- 🎨 **Responsive Design** - Optimized for all screen sizes
- 🔐 **Secure Authentication** - Powered by Supabase Auth

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Auth, Real-time)
- **PWA**: Service Worker, IndexedDB, Push API
- **Calendar**: FullCalendar
- **Notifications**: React Toastify
- **Icons**: Lucide React

## Deployment

### Deploy to Vercel

1. **Install Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy**:
   ```bash
   vercel
   ```

4. **Set Environment Variables** in Vercel Dashboard:
   - `VITE_SUPABASE_URL` - Your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` - Your Supabase anon key
   - `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key
   - `VAPID_PUBLIC_KEY` - VAPID public key for push notifications
   - `VAPID_PRIVATE_KEY` - VAPID private key for push notifications
   - `VAPID_EMAIL` - Contact email for VAPID

### Deploy to Netlify

1. **Build the project**:
   ```bash
   npm run build
   ```

2. **Deploy to Netlify**:
   - Drag and drop the `dist` folder to Netlify
   - Or connect your Git repository to Netlify

3. **Set Environment Variables** in Netlify Dashboard:
   - Same environment variables as Vercel

## Local Development

1. **Clone the repository**
2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   Create a `.env` file with:
   ```
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

4. **Run the development server**:
   ```bash
   npm run dev
   ```

## Database Setup

The application uses Supabase with the following tables:
- `tasks` - Main tasks table with recurring support
- `task_lists` - Custom task lists for organization
- `push_subscriptions` - Push notification subscriptions

All migrations are included in the `supabase/migrations` folder.

## PWA Features

- **Offline Support**: Full functionality when offline
- **Push Notifications**: Custom ringtone and interactive actions
- **Install Prompt**: Can be installed on mobile devices
- **Background Sync**: Automatic sync when connection is restored
- **Service Worker**: Caches all assets for offline use

## Browser Support

- Chrome/Edge 88+
- Firefox 85+
- Safari 14+
- Mobile browsers with PWA support

## License

MIT License - see LICENSE file for details.
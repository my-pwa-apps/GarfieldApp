# Comic Detection Logic - Detailed Explanation

## How We Detect New Comics

### Overview
The system checks if GoComics has published today's Garfield comic by fetching and analyzing the comic page.

## Detection Process

### 1. **Timezone Handling**
GoComics publishes comics based on **US Eastern Time (EST/EDT)**:
- Comics typically go live around **12:05 AM EST**
- We check at **12:10 AM EST** to give a 5-minute buffer
- This is converted to the user's local timezone automatically

**Code Flow:**
```javascript
// In serviceworker.js
const nowUTC = new Date();
const estOffset = -5; // EST is UTC-5
const nowEST = new Date(nowUTC.getTime() + (estOffset * 60 * 60 * 1000));
```

### 2. **Date Calculation**
```javascript
const year = nowEST.getUTCFullYear();
const month = String(nowEST.getUTCMonth() + 1).padStart(2, '0');
const day = String(nowEST.getUTCDate()).padStart(2, '0');
```

### 3. **Duplicate Prevention**
We track the last notified date in the service worker cache:
```javascript
const lastNotifiedDate = await getLastNotifiedDate();
const todayStr = `${year}-${month}-${day}`;

if (lastNotifiedDate === todayStr) {
  console.log('Already notified for today');
  return; // Skip
}
```

### 4. **Early Check Prevention**
Don't check before 12:05 AM EST:
```javascript
const estHour = nowEST.getUTCHours();
const estMinute = nowEST.getUTCMinutes();
if (estHour === 0 && estMinute < 5) {
  console.log('Too early, comics typically publish after 12:05 AM EST');
  return;
}
```

### 5. **Fetch Comic Page**
Use CORS proxy to fetch GoComics:
```javascript
const comicUrl = `https://www.gocomics.com/garfield/${year}/${month}/${day}`;
const proxyUrl = `https://corsproxy.garfieldapp.workers.dev/?${encodeURIComponent(comicUrl)}`;

const response = await fetch(proxyUrl, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
});
```

### 6. **Analyze HTML Content**
Check for multiple indicators:

#### ✅ **Positive Signals** (comic exists):
```javascript
const hasComic = html.includes('featureassets.gocomics.com') ||  // New CDN
                html.includes('assets.amuniversal.com') ||        // Old CDN
                (html.includes('data-image') && html.includes('garfield')); // Data attribute
```

#### ❌ **Negative Signals** (comic not ready):
```javascript
const isValid = !html.includes('Comic for') &&           // "Comic for [date] will be available..."
               !html.includes('will be available') &&    // Future availability message
               !html.includes('not yet available');      // Not published yet
```

### 7. **Send Notification**
If both conditions are true:
```javascript
if (hasComic && isValid) {
  console.log('New comic detected for:', todayStr);
  await saveLastNotifiedDate(todayStr);
  await showNotification(todayStr);
}
```

## Scheduling System

### In app.js:
```javascript
function scheduleDailyCheck() {
    // Check at 12:10 AM EST every day
    const now = new Date();
    const estCheckTime = new Date();
    estCheckTime.setUTCHours(5, 10, 0, 0); // 12:10 AM EST = 5:10 AM UTC
    
    if (now >= estCheckTime) {
        estCheckTime.setDate(estCheckTime.getDate() + 1); // Tomorrow
    }
    
    const timeUntilCheck = estCheckTime.getTime() - now.getTime();
    
    setTimeout(() => {
        checkForNewComicNow();
        setInterval(checkForNewComicNow, 24 * 60 * 60 * 1000); // Every 24 hours
    }, timeUntilCheck);
}
```

### Alternative: Periodic Background Sync
For browsers that support it (Chrome/Edge):
```javascript
if ('periodicSync' in navigator.serviceWorker) {
  const registration = await navigator.serviceWorker.ready;
  await registration.periodicSync.register('check-new-comic', {
    minInterval: 24 * 60 * 60 * 1000 // 24 hours minimum
  });
}
```

## Timezone Examples

| User Location | Local Time | EST Time | Check Triggers? |
|--------------|------------|----------|-----------------|
| New York (EST) | 12:10 AM | 12:10 AM | ✅ Yes |
| Los Angeles (PST) | 9:10 PM (prev day) | 12:10 AM | ✅ Yes |
| London (GMT) | 5:10 AM | 12:10 AM | ✅ Yes |
| Tokyo (JST) | 2:10 PM | 12:10 AM | ✅ Yes |
| Sydney (AEDT) | 4:10 PM | 12:10 AM | ✅ Yes |

## Edge Cases Handled

### 1. **User in Different Timezone**
✅ Solved: We calculate check time based on EST, then convert to user's local time for scheduling

### 2. **Daylight Saving Time**
⚠️ Current implementation uses fixed UTC-5 offset
🔧 Could be improved by detecting DST automatically

### 3. **GoComics Delay**
✅ Solved: 5-minute buffer after midnight EST

### 4. **Network Failure**
✅ Handled: Try-catch blocks with error logging

### 5. **Service Worker Not Running**
✅ Handled: Fallback to setTimeout scheduling in main app

### 6. **Multiple Notifications**
✅ Prevented: Cache tracking of last notified date

## Potential Improvements

### 1. **Better DST Handling**
```javascript
function getESTOffset(date) {
  // Detect if DST is in effect
  const jan = new Date(date.getFullYear(), 0, 1);
  const jul = new Date(date.getFullYear(), 6, 1);
  const stdOffset = Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
  const isDST = date.getTimezoneOffset() < stdOffset;
  return isDST ? -4 : -5; // EDT is UTC-4, EST is UTC-5
}
```

### 2. **Retry Logic**
```javascript
async function checkWithRetry(maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await checkForNewComic();
      if (result.success) return result;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 5000 * (i + 1))); // Exponential backoff
    }
  }
}
```

### 3. **User Preference for Check Time**
Allow users to choose when they want to be notified:
- "As soon as available" (12:10 AM EST)
- "Morning" (6:00 AM local)
- "Evening" (6:00 PM local)

### 4. **Language Detection**
Check both English and Spanish comics if user has Spanish enabled:
```javascript
const language = localStorage.getItem('spanish') === 'true' ? 'es' : 'en';
const comicPath = language === 'es' ? 'garfieldespanol' : 'garfield';
```

## Testing the Detection

### Manual Test in Browser Console:
```javascript
// Trigger immediate check
navigator.serviceWorker.ready.then(registration => {
  registration.active.postMessage({ type: 'CHECK_NEW_COMIC' });
});

// Check when next notification is scheduled
console.log('Notification scheduled:', localStorage.getItem('notifications'));
```

### Check Service Worker Logs:
1. Open DevTools → Application → Service Workers
2. Check "Update on reload"
3. Look for console logs from `checkForNewComic()`

### Force Notification Test:
```javascript
// In service worker context
self.registration.showNotification('Test: New Garfield Comic!', {
  body: 'Testing notification system',
  icon: './android/android-launchericon-192-192.png'
});
```

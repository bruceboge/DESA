// One-time script to mark an admin email as verified in Firebase Auth.
// Run from the backend folder:  node verify-admin.js
import 'dotenv/config';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  })
});

const auth = getAuth(app);
const email = process.env.FIREBASE_ADMIN_EMAILS.split(',')[0].trim();

console.log(`Looking up user: ${email}`);
const user = await auth.getUserByEmail(email);
console.log(`Found UID: ${user.uid}, emailVerified: ${user.emailVerified}`);

if (!user.emailVerified) {
  await auth.updateUser(user.uid, { emailVerified: true });
  console.log('✅ Email marked as verified!');
} else {
  console.log('✅ Email is already verified.');
}

process.exit(0);

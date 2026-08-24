import { signup } from './actions';

export default function SignupPage() {
  return (
    <main>
      <h1>Sign up</h1>

      <form action={signup}>
        <div>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required />
        </div>

        <div>
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required />
        </div>

        <button type="submit">Sign up</button>
      </form>
    </main>
  );
}

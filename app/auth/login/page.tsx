import { login } from './actions';

export default function LoginPage() {
  return (
    <main>
      <h1>Log in</h1>

      <form action={login}>
        <div>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required />
        </div>

        <div>
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required />
        </div>

        <button type="submit">Log in</button>
      </form>
    </main>
  );
}

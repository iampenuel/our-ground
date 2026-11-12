# Simulated adult assistance for the Nittany AI Challenge

This feature demonstrates adult assistance using simulated verification. It does not independently verify anyone's age.

Open `/adult-help-demo` directly, or choose **I'm under 19** on the age-confirmation screen and select **See how an adult can help**. Start the demo, choose a simulated result, and explore fictional Find Support and Give Support examples after success. **Finish adult assistance demo** returns to the ordinary age gate. The demo can be replayed with the original age decision intact.

The middleware renders only the demo entrance and its fixed scene paths using the existing entrance stylesheet and preview images. The scene links only navigate within the preview or return to the age gate. The demo stores no session state, issues no cookies, and uses embedded fictional data. The normal age gate still protects the application and its APIs. The demo requires no verification provider, identity information, Redis, database access, or AI calls.

After review, merge PR #12 and verify the merged commit in CI. Confirm the production alias's deployment ID as the rollback target, then smoke-test a protected candidate using the existing production configuration. Promote only with owner approval. After promotion, repeat the age denial, simulation, and protected-route smoke checks on the public alias.

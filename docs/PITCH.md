# Oira

**A private attribute vault on Solana. Brands find out whether you match what they are looking for, and pay you for it, without ever learning who you are.**

## The problem

The things that make you a good match are usually the things you would least like to broadcast. Our first user is a woman buying makeup. Her undertone, her depth, her colour season decide what actually suits her, and none of it is a stranger's business. A brand would pay real money to reach exactly the people its shade fits. She would take that money, if it did not mean handing her face to a database.

You can hide any single answer with cryptography. That was never the hard part. The hard part is that these attributes do not change, so a private match has to stay safe not just once, but every time any brand asks. So the real problem was never one private match. It was making a private match safe to repeat.

## What Oira does

Oira answers those matching questions inside a MagicBlock Private Ephemeral Rollup, a hardware enclave, and settles the money on Solana. Her traits are sealed in the enclave and never come out. A brand escrows funds against an offer it can only describe as a commitment. Her agent, a session key limited to one instruction, runs the match inside the enclave, where the program reads her sealed traits and decides the verdict itself. The brand never gets to assert its own result.

What reaches the public chain is deliberately empty of her: a commitment to her traits, a receipt that hides the verdict, and a payout wallet that stays a commitment until she chooses to open it. Repeated queries are rate-limited and priced, so asking is never free and never unlimited. That is the piece the field has been missing, and it is what turns a one-off private match into something she can safely let run for years.

## What is live right now

The program is deployed on Solana devnet and the whole flow is proven end to end. In the recorded run a brand escrows funds, her traits are sealed, her agent runs the match in the enclave, and the payout is released only by the real verdict. The verdict and the nonce are wiped from the base chain before it commits, so they never leak. A forged nonce is rejected on-chain. A wrong offer is rejected on-chain. She is paid exactly what she was owed, and the base chain never learns her shade or her answer.

This is not a mockup. It is a deployed program, an open repository, and a test you can run yourself against the live TEE.

## Why this needs MagicBlock

The match is an interactive decision over a secret, and it has to be both private and cheap enough to happen constantly in the background while she is offline. A Private Ephemeral Rollup is what makes that possible: her agent runs the match instantly and gas free inside the enclave, and only the commitments settle back to Solana. Take the enclave away and either her traits touch the base chain or the whole thing collapses into "trust our server." The private rollup is not a performance nicety here. It is the thing that lets the privacy and the economics coexist.

## Why this belongs on Seeker

The match runs in a server-side enclave. The Seeker gives her keys a second hardware home. Her owner key and her agent session key live in Seed Vault, so the key that finally links a wallet to a payout never enters app memory, and the scoped agent key that runs matches while she sleeps is a hardware capability she can grant and revoke, not a file. Her traits are protected by the rollup's enclave, her keys by the phone's secure element, and at no point, on the device or the server, does anything that identifies her sit in plaintext outside a TEE. That is a stronger promise than a private vault bolted onto a consumer app, and it is Seeker-native by design.

## The bigger picture

Beauty and colour are where we start because the pain is obvious and the money is real. The mechanism is not specific to it. Anywhere a person is matched on something sensitive, health, biometrics, income, identity, the same shape holds: prove the match, meter the asking, keep the person invisible, and pay them directly. Oira is that protocol, and the first product is proof it works.

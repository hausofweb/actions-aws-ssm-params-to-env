# Contributing

Do not commit `node_modules`. Commit the bundled output in `dist` after source
changes so reviewers and CI can verify the generated artifact is current and
reproducible.

Generate the bundle before committing:

```bash
npm run bundle
```

Source:
[See link](https://docs.github.com/en/actions/creating-actions/creating-a-javascript-action#commit-tag-and-push-your-action-to-github)

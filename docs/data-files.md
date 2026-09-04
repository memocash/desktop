# Data files

Everything the app keeps is under `~/.memo`:

- `wallets/` holds the wallets.
- `network.json` lists the networks. `network-approved.json`, `theme.json` and
  `updates.json` hold settings.
- `*.db` files are the databases, one per network: `memo.db` (BCH),
  `memo-sv.db` (BSV) and `memo-local.db` (a local index server). SQLite keeps
  `-wal` and `-shm` files beside each one. A database is a cache of the
  network's index server: delete one and the next run fills it again.

## Which directory a build opens

The network chooses the file name; the build chooses the directory.

| | BCH | BSV | Local |
|---|---|---|---|
| Packaged build | `~/.memo/memo.db` | `~/.memo/memo-sv.db` | `~/.memo/memo-local.db` |
| Checkout (`npm start`) | `~/.memo/dev/memo.db` | `~/.memo/dev/memo-sv.db` | `~/.memo/dev/memo-local.db` |
| `MEMO_DATA=other` | `~/.memo/other/memo.db` | `~/.memo/other/memo-sv.db` | `~/.memo/other/memo-local.db` |

A checkout keeps its databases under `dev/` so development never writes the
installed app's files. `MEMO_DATA` names any other directory under `~/.memo`,
for a run that should leave both alone, such as a smoke test:

```bash
MEMO_DATA=smoke npm start
```

It must be a single directory name; a path is refused at startup. The stored
`DatabaseFile` in `network.json` never changes, only the directory the
running build opens it from. The rule is `DataDirectory` and
`InDataDirectory` in `main/common/util/network_config.js`.

The app logs the directory at startup, and the Network view shows the file a
window is using.

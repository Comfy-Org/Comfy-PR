# Slack API Features for Agent Research

## Overview

This document explores useful Slack Web API methods for AI agents to research and understand Slack conversations beyond basic message reading.

## Currently Implemented

### ✅ Basic Message Operations

- `conversations.history` - Read message history
- `conversations.replies` - Read thread replies
- `conversations.list` - List channels
- `users.info` - Get user information
- `users.profile.get` - Get user profile
- `chat.update` - Update messages
- `chat.postMessage` - Post messages
- `files.uploadV2`, `files.info`, `files.delete` - File operations

## Useful APIs for Agent Research

### 1. **Reactions** (`slack.reactions.*`)

**Why useful**: Understand message importance and sentiment

```typescript
// Get reactions for a message
await slack.reactions.get({
  channel: "C123",
  timestamp: "1234567890.123456",
});
// Returns: {name: "thumbs_up", count: 5, users: ["U123", "U456"]}

// List all reactions by user
await slack.reactions.list({
  user: "U123",
  count: 20,
});
// Discover what messages a user has reacted to
```

**Use cases**:

- Find highly engaged messages (many reactions)
- Discover sentiment (emoji types)
- Track who's engaging with content
- Find consensus (check marks, thumbs up)

---

### 2. **Search** (`slack.search.*`)

**Why useful**: Find relevant messages across all channels

```typescript
// Search all messages
await slack.search.messages({
  query: "authentication bug",
  count: 20,
  sort: "timestamp",
  sort_dir: "desc",
});

// Search files
await slack.search.files({
  query: "quarterly report.pdf",
  count: 10,
});
```

**Use cases**:

- Find historical discussions on a topic
- Discover related conversations
- Research bug reports or features
- Find documents and files

---

### 3. **Bookmarks** (`slack.bookmarks.*`)

**Why useful**: Discover important channel resources

```typescript
// List bookmarks in a channel
await slack.bookmarks.list({
  channel_id: "C123",
});
// Returns: Links, docs, tools the team considers important

// Get bookmark details
await slack.bookmarks.get({
  bookmark_id: "Bm123",
});
```

**Use cases**:

- Find important docs/links in a channel
- Understand channel resources
- Discover team tools and references

---

### 4. **Pins** (`slack.pins.*`)

**Why useful**: Find critically important messages

```typescript
// List pinned messages in a channel
await slack.pins.list({
  channel: "C123",
});
// Returns: Messages pinned as important by team
```

**Use cases**:

- Find announcements
- Discover channel guidelines
- Get quick context on channel purpose
- Find important decisions

---

### 5. **Stars** (`slack.stars.*`)

**Why useful**: Understand user's saved/important items

```typescript
// List starred items (messages, files, channels)
await slack.stars.list({
  count: 100,
});
```

**Use cases**:

- Find what user considers important
- Discover frequently referenced messages
- Understand user interests

---

### 6. **Reminders** (`slack.reminders.*`)

**Why useful**: Understand pending actions and follow-ups

```typescript
// List all reminders
await slack.reminders.list();

// Get reminder details
await slack.reminders.info({
  reminder: "Rm123",
});
```

**Use cases**:

- Track pending action items
- Understand team TODOs
- Find follow-up tasks

---

### 7. **Conversations Search** (`slack.admin.conversations.search`)

**Why useful**: Advanced channel discovery for enterprise

```typescript
await slack.admin.conversations.search({
  query: "engineering",
  sort: "member_count",
  sort_dir: "desc",
});
```

**Use cases**:

- Discover relevant channels
- Find where discussions happen
- Understand org structure

---

### 8. **User Presence** (`slack.users.getPresence`, `slack.users.setPresence`)

**Why useful**: Know if someone is available

```typescript
await slack.users.getPresence({
  user: "U123",
});
// Returns: {ok: true, presence: "active", online: true}
```

**Use cases**:

- Check if user is online before messaging
- Understand team availability
- Time zone awareness

---

### 9. **Conversation Members** (`slack.conversations.members`)

**Why useful**: Understand channel participation

```typescript
await slack.conversations.members({
  channel: "C123",
  limit: 100,
});
// Returns: List of all members in channel
```

**Use cases**:

- Know who can see messages
- Find domain experts
- Understand team composition

---

### 10. **Conversation Info** (`slack.conversations.info`)

**Why useful**: Get channel metadata

```typescript
await slack.conversations.info({
  channel: "C123",
  include_num_members: true,
});
// Returns: {
//   name: "engineering",
//   topic: "Engineering discussions",
//   purpose: "Solve technical problems",
//   num_members: 45,
//   is_archived: false,
//   is_private: false
// }
```

**Use cases**:

- Understand channel purpose
- Check if archived
- Get member count
- Read topic/description

---

### 11. **Team Info** (`slack.team.info`)

**Why useful**: Understand workspace details

```typescript
await slack.team.info();
// Returns workspace name, domain, icon, etc.
```

---

### 12. **User Conversations** (`slack.users.conversations`)

**Why useful**: Find all channels/DMs a user is in

```typescript
await slack.users.conversations({
  user: "U123",
  types: "public_channel,private_channel,mpim,im",
  limit: 200,
});
```

**Use cases**:

- Discover where user participates
- Find relevant channels for a topic
- Understand user's areas of work

---

### 13. **Conversation Mark** (`slack.conversations.mark`)

**Why useful**: Track read position

```typescript
await slack.conversations.mark({
  channel: "C123",
  ts: "1234567890.123456",
});
// Mark conversation as read up to this point
```

---

### 14. **DND (Do Not Disturb)** (`slack.dnd.*`)

**Why useful**: Respect user's focus time

```typescript
await slack.dnd.info({
  user: "U123",
});
// Returns: {dnd_enabled: true, next_dnd_start_ts: 1234567890}

await slack.dnd.teamInfo({
  users: "U123,U456,U789",
});
// Check multiple users' DND status
```

**Use cases**:

- Don't disturb users during focus time
- Schedule messages appropriately
- Understand team working hours

---

### 15. **Chat Permalink** (`slack.chat.getPermalink`)

**Why useful**: Get shareable links to messages

```typescript
await slack.chat.getPermalink({
  channel: "C123",
  message_ts: "1234567890.123456",
});
// Returns: {permalink: "https://workspace.slack.com/archives/C123/p1234567890"}
```

**Use cases**:

- Share specific messages in reports
- Create references to discussions
- Build knowledge bases with links

---

## Recommended Implementation Priority

### High Priority (Immediate Value)

1. **`reactions.get`** - Understand engagement
2. **`search.messages`** - Find relevant discussions
3. **`pins.list`** - Discover important messages
4. **`conversations.info`** - Get channel context
5. **`chat.getPermalink`** - Generate shareable links

### Medium Priority (Enhanced Context)

6. **`bookmarks.list`** - Find channel resources
7. **`users.conversations`** - Discover user's channels
8. **`conversations.members`** - Know who's in channel
9. **`users.getPresence`** - Check availability
10. **`dnd.teamInfo`** - Respect focus time

### Low Priority (Nice to Have)

11. **`stars.list`** - User-saved items
12. **`reminders.list`** - Pending actions
13. **`search.files`** - File search
14. **`admin.conversations.search`** - Enterprise channel search

---

## Example: Complete Message Context

Combining multiple APIs to get full context about a message:

```typescript
async function getCompleteMessageContext(channel: string, ts: string) {
  // 1. Get the message itself
  const messages = await slack.conversations.history({
    channel,
    latest: ts,
    inclusive: true,
    limit: 1,
  });
  const message = messages.messages?.[0];

  // 2. Get reactions
  const reactions = await slack.reactions
    .get({
      channel,
      timestamp: ts,
    })
    .catch(() => null);

  // 3. Get thread replies if it's a thread
  const thread = message?.thread_ts
    ? await slack.conversations.replies({
        channel,
        ts: message.thread_ts,
        limit: 100,
      })
    : null;

  // 4. Get channel info
  const channelInfo = await slack.conversations.info({
    channel,
    include_num_members: true,
  });

  // 5. Get user info
  const userInfo = message?.user
    ? await slack.users.info({
        user: message.user,
      })
    : null;

  // 6. Get permalink
  const permalink = await slack.chat.getPermalink({
    channel,
    message_ts: ts,
  });

  // 7. Check if pinned
  const pins = await slack.pins.list({ channel });
  const isPinned = pins.items?.some((item: any) => item.message?.ts === ts);

  return {
    message,
    reactions: reactions?.message?.reactions || [],
    threadCount: thread?.messages?.length || 0,
    channelName: channelInfo.channel?.name,
    channelTopic: channelInfo.channel?.topic?.value,
    channelMembers: channelInfo.channel?.num_members,
    userName: userInfo?.user?.real_name,
    permalink: permalink.permalink,
    isPinned,
  };
}
```

---

## Command Ideas for prbot CLI

### New Command Suggestions

```bash
# Get reactions summary
prbot slack reactions <message_url>

# Search messages
prbot slack search -q "query" [-c <channel>] [-l <limit>]

# List pinned messages
prbot slack pins <channel_url>

# Get channel bookmarks
prbot slack bookmarks <channel_url>

# Get full message context
prbot slack context <message_url>

# Search across workspace
prbot slack find "authentication bug" --sort recent --limit 10

# Get channel members
prbot slack members <channel_url>

# Check user presence
prbot slack presence <user_id>
```

---

## YAML Output Format Examples

### Reactions

```yaml
message_ts: "1234567890.123456"
total_reactions: 12
reactions:
  - name: thumbs_up
    count: 5
    users:
      - user_id: U123
        username: alice
      - user_id: U456
        username: bob
  - name: heart
    count: 3
    users:
      - user_id: U789
        username: charlie
```

### Pinned Messages

```yaml
channel: C123
channel_name: engineering
total_pins: 3
pins:
  - ts: "1234567890.123456"
    user: U123
    username: alice
    text: "Team guidelines: Always run tests..."
    permalink: https://workspace.slack.com/archives/C123/p1234567890
    pinned_at: "2025-01-20T10:30:00Z"
```

### Search Results

```yaml
query: "authentication bug"
total_results: 45
matches:
  - channel: C123
    channel_name: engineering
    ts: "1234567890.123456"
    user: U456
    username: bob
    text: "Found the auth bug in session.ts:120"
    permalink: https://workspace.slack.com/archives/C123/p1234567890
    score: 0.95
    reactions:
      - thumbs_up: 3
```

---

## Next Steps

1. **Implement high-priority commands** in prbot CLI
2. **Create helper functions** for common research patterns
3. **Add caching** for expensive operations (search, list operations)
4. **Document usage patterns** for agent prompt templates
5. **Build composite commands** that combine multiple APIs

// TODO: https://docs.slack.dev/changelog/2025/10/7/chat-streaming/
import {slack} from '@/src/slack';
if(import.meta.main){
  await slack.chat.stream({
    
  })
}


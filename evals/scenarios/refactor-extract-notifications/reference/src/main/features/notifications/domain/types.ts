export type Message =
  | {
      readonly channel: 'email';
      readonly to: string;
      readonly subject: string;
      readonly body: string;
    }
  | { readonly channel: 'sms'; readonly to: string; readonly text: string };

export type Recipient = {
  readonly name: string;
  readonly email: string;
  readonly phone?: string;
  readonly preferredChannel: Message['channel'];
  readonly utcOffsetMinutes: number;
};

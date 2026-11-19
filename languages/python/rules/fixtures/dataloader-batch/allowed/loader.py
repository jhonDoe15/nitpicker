from promise.dataloader import DataLoader


class ChannelLoader(DataLoader):
    def batch_load(self, keys):
        by_id = {channel.pk: channel for channel in load_channels(keys)}
        return [by_id.get(key) for key in keys]

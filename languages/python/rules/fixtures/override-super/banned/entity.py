from homeassistant.helpers.update_coordinator import CoordinatorEntity


class RoomSensor(CoordinatorEntity):
    @property
    def available(self) -> bool:
        return self.coordinator.data.device.online

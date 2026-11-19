from homeassistant.helpers.update_coordinator import CoordinatorEntity


class RoomSensor(CoordinatorEntity):
    @property
    def available(self) -> bool:
        return super().available and self.coordinator.data.device.online

export interface AmsHtDryerStatus {
    state?: string
    fault?: string
    target?: number
    heater_temperature?: number
    chamber_temperature?: number
    absolute_humidity?: number
    remaining?: number
    heater_power?: number
    fan_target?: number
    fan_rpm?: number
    fan_pwm?: number
    vent_position?: string
    purging?: boolean
    door_closed?: boolean
}

export interface AmsHtSensorStatus {
    f1s_counts?: number
    filament_present?: boolean
    hub_counts?: number
    hub_filament_present?: boolean
    door_counts?: number
    door_closed?: boolean
    encoder_clicks?: number
    buffer?: number
}

export interface AmsHtMotorStatus {
    enabled?: boolean
    forward?: boolean
    target_frequency?: number
    target_duty?: number
    current_target_ma?: number
    temperature_valid?: boolean
    temperature?: number
    frequency?: number
    rpm?: number
    current_adc?: number
    applied_duty?: number
    drive_fault?: number
}

export interface AmsHtRfidStatus {
    result?: string
    version?: number
    uid?: string
    uid_length?: number
    sak?: number
    atqa?: number
}

export interface AmsHtQualifierStatus {
    connected?: boolean
    mcu?: string
    telemetry_age?: number | null
    last_command?: string
    last_result?: string
    last_error?: string
    dryer?: AmsHtDryerStatus
    sensors?: AmsHtSensorStatus
    motor?: AmsHtMotorStatus
    rfid?: AmsHtRfidStatus
}

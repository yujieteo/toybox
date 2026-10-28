#pragma once
#include <stdint.h>
typedef struct gs_stack gs_stack;
#pragma pack(push, 1)
typedef struct { uint8_t *base; int64_t len; } gs_rhdr;
typedef struct { gs_rhdr *hdr; gs_stack *stk; } gs_rref;
typedef struct { gs_rhdr *hdr; gs_stack *stk; gs_rhdr *fl; gs_stack *flstk; } gs_pref;

typedef struct { double e[23]; } a23_f64;

typedef struct { uint8_t *data; int64_t len; } sl_u8;

typedef struct Pose_g Pose_g;
struct Pose_g {
    double s_g;
    double sx_g;
    double sz_g;
    double dx_g;
    double z_g;
    double up_g;
    double tilt_g;
    double eye_g;
    double gaze_g;
    double ex_g;
    double ez_g;
    double spin_g;
};

typedef struct Gz_g Gz_g;
struct Gz_g {
    double x_g;
    double z_g;
};

typedef struct { double e[12]; } a12_f64;

typedef struct ByteSet_g ByteSet_g;
typedef struct { uint8_t e[256]; } a256_b;

typedef struct { uint8_t e[3]; } a3_u8;

typedef struct { uint8_t e[16]; } a16_u8;

struct ByteSet_g {
    a256_b members_g;
    uint8_t kind_g;
    uint8_t invert_g;
    a3_u8 bytes_g;
    a16_u8 lo_g;
    a16_u8 hi_g;
};

#pragma pack(pop)

#ifdef __cplusplus
extern "C" {
#endif
void goose_init(int argc, char **argv);
void clear(void);
void put(double gs_export_arg0);
double out(int32_t gs_export_arg0_2);
int32_t out_len(void);
int32_t moves(void);
int32_t seed_of(void);
void pose(double gs_export_arg0_3, int32_t gs_export_arg1, int32_t gs_export_arg2);
void marks(void);
void plain(void);
double lead(void);
double gap(void);
double tail(void);
double stand_in(void);
double stand_in_seconds(int32_t gs_export_arg0_4);
double timeline(void);
int32_t find(int32_t gs_export_arg0_5);
double cue_time(double gs_export_arg0_6, double gs_export_arg1_2, int32_t gs_export_arg2_2, int32_t gs_export_arg3, double gs_export_arg4);
#ifdef __cplusplus
}
#endif

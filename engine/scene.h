#pragma once
#include <stdint.h>
typedef struct gs_stack gs_stack;
#pragma pack(push, 1)
typedef struct { uint8_t *base; int64_t len; } gs_rhdr;
typedef struct { gs_rhdr *hdr; gs_stack *stk; } gs_rref;
typedef struct { gs_rhdr *hdr; gs_stack *stk; gs_rhdr *fl; gs_stack *flstk; } gs_pref;

typedef struct { double e[23]; } a23_f64;

typedef struct Mat_g Mat_g;
typedef struct { float e[16]; } a16_f32;

struct Mat_g {
    a16_f32 m_g;
};

typedef struct V_g V_g;
struct V_g {
    float x_g;
    float y_g;
    float z_g;
    float nx_g;
    float ny_g;
    float nz_g;
};

typedef struct Obj_g Obj_g;
struct Obj_g {
    int32_t prim_g;
    int32_t mesh_g;
    int32_t parent_g;
    int32_t flags_g;
    int32_t variant_g;
    int32_t pose_g;
    int32_t flip_g;
    float x_g;
    float y_g;
    float z_g;
    float yaw_g;
    float rx_g;
    float ry_g;
    float rz_g;
    float sx_g;
    float sy_g;
    float sz_g;
    float r_g;
    float g_g;
    float b_g;
    float r2_g;
    float g2_g;
    float b2_g;
    float shadow_g;
};

typedef struct { float *data; int64_t len; } sl_f32;

typedef struct Trk_g Trk_g;
struct Trk_g {
    int32_t obj_g;
    int32_t ch_g;
    int32_t first_g;
    int32_t n_g;
};

typedef struct { uint8_t *data; int64_t len; } sl_u8;

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
void scene_init(int32_t gs_export_arg0, int32_t gs_export_arg1);
void scene_resize(int32_t gs_export_arg0_2, int32_t gs_export_arg1_2);
void scene_lod(int32_t gs_export_arg0_3, float gs_export_arg1_3);
void skel_set(int32_t gs_export_arg0_4, int32_t gs_export_arg1_4, float gs_export_arg2, float gs_export_arg3, float gs_export_arg4);
void scene_reset(void);
int32_t obj_add(int32_t gs_export_arg0_5, int32_t gs_export_arg1_5, int32_t gs_export_arg2_2, int32_t gs_export_arg3_2, int32_t gs_export_arg4_2, int32_t gs_export_arg5, int32_t gs_export_arg6, float gs_export_arg7, float gs_export_arg8, float gs_export_arg9, float gs_export_arg10, float gs_export_arg11, float gs_export_arg12, float gs_export_arg13, float gs_export_arg14, float gs_export_arg15, float gs_export_arg16, float gs_export_arg17, float gs_export_arg18, float gs_export_arg19, float gs_export_arg20, float gs_export_arg21, float gs_export_arg22, float gs_export_arg23);
void obj_bone(int32_t gs_export_arg0_6, int32_t gs_export_arg1_6);
void obj_pose(int32_t gs_export_arg0_7, float gs_export_arg1_7, float gs_export_arg2_3, float gs_export_arg3_3, float gs_export_arg4_3, float gs_export_arg5_2, float gs_export_arg6_2, float gs_export_arg7_2, float gs_export_arg8_2, float gs_export_arg9_2);
void trk_begin(int32_t gs_export_arg0_8, int32_t gs_export_arg1_8);
void key_add(float gs_export_arg0_9, float gs_export_arg1_9, float gs_export_arg2_4, float gs_export_arg3_4, int32_t gs_export_arg4_4);
void cam_add(float gs_export_arg0_10, float gs_export_arg1_10, float gs_export_arg2_5, float gs_export_arg3_5, float gs_export_arg4_5, float gs_export_arg5_3, float gs_export_arg6_3, float gs_export_arg7_3, int32_t gs_export_arg8_3);
void light_add(float gs_export_arg0_11, int32_t gs_export_arg1_11);
void set_backdrop(int32_t gs_export_arg0_12, float gs_export_arg1_12, float gs_export_arg2_6, float gs_export_arg3_6, float gs_export_arg4_6, float gs_export_arg5_4);
void set_cutaway(int32_t gs_export_arg0_13, int32_t gs_export_arg1_13);
void ground_map(int32_t gs_export_arg0_14, float gs_export_arg1_14, float gs_export_arg2_7, float gs_export_arg3_7, float gs_export_arg4_7);
void cam_user(int32_t gs_export_arg0_15, float gs_export_arg1_15, float gs_export_arg2_8, float gs_export_arg3_8, float gs_export_arg4_8, float gs_export_arg5_5, float gs_export_arg6_4);
void render_frame(double gs_export_arg0_16);
int32_t project(float gs_export_arg0_17, float gs_export_arg1_16, float gs_export_arg2_9);
float proj_x(void);
float proj_y(void);
float obj_wx(int32_t gs_export_arg0_18);
float obj_wy(int32_t gs_export_arg0_19);
float obj_wz(int32_t gs_export_arg0_20);
int32_t obj_visible(int32_t gs_export_arg0_21);
float cam_x(void);
float cam_y(void);
float cam_z(void);
#ifdef __cplusplus
}
#endif

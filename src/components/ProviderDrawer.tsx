import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {BlurView} from 'expo-blur';
import {View, Text, BackHandler, findNodeHandle, StyleSheet} from 'react-native';
// The gesture handler ScrollView lets a held row take over from scrolling.
import {ScrollView} from 'react-native-gesture-handler';
import React, {useEffect} from 'react';
import useContentStore from '../lib/zustand/contentStore';
import {MaterialIcons} from '@expo/vector-icons';
import {useM3Colors} from '../theme/M3PaletteContext';
import {isTV} from '../lib/tv';
import {TVFocusable, TVFocusGuide} from './tv';
import {useTVFocusBorderColor} from '../lib/tv/useTVFocusBorderColor';
import ProviderIcon from './ProviderIcon';
import ReorderableProviderList from './ReorderableProviderList';
import LiquidGlassSurface from './LiquidGlassSurface';

interface ProviderDrawerProps {
  onClose: () => void;
  /** The mobile drawer renders its content while closed. */
  isOpen?: boolean;
  onSelectProvider?: (
    provider: import('../lib/storage/extensionStorage').ProviderExtension,
  ) => void;
}

const ProviderDrawer = ({
  onClose,
  isOpen = true,
  onSelectProvider,
}: ProviderDrawerProps) => {
  const provider = useContentStore(state => state.provider);
  const setProvider = useContentStore(state => state.setProvider);
  const installedProviders = useContentStore(state => state.installedProviders);
  const hasSelectedProvider = installedProviders.some(
    item => item.value === provider.value,
  );
  const primary = useM3Colors().primary;
  const insets = useSafeAreaInsets();
  const focusBorderColor = useTVFocusBorderColor(primary);
  const mountTimeRef = React.useRef<number>(Date.now());
  const closeRef = React.useRef<View>(null);
  const firstProviderRef = React.useRef<View>(null);
  const [closeNode, setCloseNode] = React.useState<number | null>(null);
  const [firstProviderNode, setFirstProviderNode] = React.useState<number | null>(null);

  const handleClose = React.useCallback(() => {
    if (Date.now() - mountTimeRef.current < 350) return;
    onClose();
  }, [onClose]);

  const handleSelectProvider = React.useCallback(
    (item: any) => {
      if (Date.now() - mountTimeRef.current < 350) return;
      if (onSelectProvider) onSelectProvider(item);
      else {
        setProvider(item);
        onClose();
      }
    },
    [setProvider, onClose, onSelectProvider],
  );

  useEffect(() => {
    // A closed drawer must not swallow back presses for the whole app.
    if (!isOpen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleClose();
      return true;
    });
    return () => sub.remove();
  }, [handleClose, isOpen]);

  return (
    <TVFocusGuide
      trapFocusLeft={true}
      trapFocusRight={true}
      trapFocusUp={true}
      trapFocusDown={true}
      style={{flex: 1, backgroundColor: isTV ? '#121214' : 'transparent'}}>
      {!isTV ? (
        <>
          <BlurView tint="dark" intensity={58} style={StyleSheet.absoluteFill} />
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, {backgroundColor: 'rgba(7,8,12,0.62)'}]}
          />
        </>
      ) : null}
      <LiquidGlassSurface
        style={{
          marginHorizontal: 12,
          marginTop: isTV ? 16 : insets.top + 8,
          marginBottom: 12,
          borderRadius: 20,
        }}
        contentStyle={{
          minHeight: 76,
          paddingHorizontal: 18,
          paddingVertical: 14,
        }}>
        <View style={{flex: 1}}>
          <Text className="text-white text-2xl font-bold">Select Provider</Text>
          <Text className="text-gray-400 mt-1 text-sm">Content source</Text>
        </View>
        {isTV ? (
          <TVFocusable
            ref={closeRef}
            onLayout={() => setCloseNode(findNodeHandle(closeRef.current))}
            nextFocusDown={firstProviderNode}
            accessibilityRole="button"
            accessibilityLabel="Close drawer"
            hasTVPreferredFocus={false}
            onPress={handleClose}
            borderRadius={20}
            focusScale={1.1}
            focusBorderColor={focusBorderColor}
            style={{
              alignItems: 'center',
              backgroundColor: 'rgba(255,255,255,0.10)',
              borderColor: 'rgba(255,255,255,0.16)',
              borderWidth: StyleSheet.hairlineWidth,
              borderRadius: 20,
              height: 40,
              justifyContent: 'center',
              width: 40,
            }}>
            <MaterialIcons name="close" size={24} color="#FFFFFF" />
          </TVFocusable>
        ) : null}
      </LiquidGlassSurface>

      <TVFocusGuide
        autoFocus={true}
        trapFocusLeft={true}
        trapFocusRight={true}
        trapFocusUp={false}
        trapFocusDown={true}
        style={{flex: 1}}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          className="flex-1 px-2">
          {/* TV keeps a plain list: rows are picked with the remote. */}
          {isTV &&
            installedProviders.map((item, index) => {
              const isSelected = provider.value === item.value;
              // One preferred item only: the selected provider, else the first.
              const isPreferred = hasSelectedProvider
                ? isSelected
                : index === 0;

              return (
                <TVFocusable
                  key={item.value}
                  ref={index === 0 ? firstProviderRef : undefined}
                  onLayout={index === 0 ? () => setFirstProviderNode(findNodeHandle(firstProviderRef.current)) : undefined}
                  nextFocusUp={index === 0 ? closeNode : undefined}
                  hasTVPreferredFocus={isPreferred}
                  onPress={() => handleSelectProvider(item)}
                  borderRadius={12}
                  focusScale={1.03}
                  focusBorderColor={focusBorderColor}
                  style={{
                    alignItems: 'center',
                    backgroundColor: isSelected
                      ? 'rgba(255, 255, 255, 0.15)'
                      : 'rgba(255, 255, 255, 0.04)',
                    borderRadius: 12,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    marginVertical: 3,
                    paddingHorizontal: 16,
                    paddingVertical: 13,
                  }}>
                  {({focused}) => (
                    <LiquidGlassSurface
                      selected={isSelected}
                      style={{flex: 1, borderRadius: 14}}
                      contentStyle={{minHeight: 54, paddingHorizontal: 16}}>
                      <View
                        style={{alignItems: 'center', flexDirection: 'row', flex: 1}}>
                        <ProviderIcon
                          uri={item.icon}
                          name={item.display_name}
                          size={24}
                          background="rgba(255, 255, 255, 0.08)"
                          color={focused || isSelected ? primary : '#888'}
                        />
                        <Text
                          style={{
                            color:
                              focused || isSelected ? '#FFFFFF' : '#B0B0B0',
                            fontSize: 16.5,
                            fontWeight: focused || isSelected ? '700' : '500',
                            marginLeft: 10,
                          }}>
                          {item.display_name}
                        </Text>
                      </View>
                      {isSelected && (
                        <MaterialIcons name="check" size={22} color={primary} />
                      )}
                    </LiquidGlassSurface>
                  )}
                </TVFocusable>
              );
            })}
          {!isTV && (
            <ReorderableProviderList
              providers={installedProviders}
              selectedValue={provider.value}
              primary={primary}
              onSelect={handleSelectProvider}
            />
          )}
          <View className="h-16" />
        </ScrollView>
      </TVFocusGuide>
    </TVFocusGuide>
  );
};

export default ProviderDrawer;
